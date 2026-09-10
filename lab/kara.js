// Kara katmanı — denizin yaptığının karadaki karşılığı.
//
// NEDEN AYRI DOSYA: deniz çalışıyor ve bozulmamalı. Bu katman `lab/ocean.js`
// içindeki hiçbir şeye dokunmaz; kendi mesh'i, kendi uniformları, kendi
// tuşuyla anında kapanır. Su ile ortak olan tek şey ARKA DOKU (haritanın
// kendi karesi) ve güneş yönü — ikisi de dışarıdan verilir.
//
// SORUN: karanın taban rengi hex başına TEK renktir (NEAREST örneklenen bir
// doku). Kabartma ve pigment onun üstüne ince çarpanlar olarak biner, yani
// bir hexin İÇİNDE biçim yoktur; sonuç ne kadar iyi gölgelenirse gölgelensin
// "boyanmış altıgen" kalır. Denize tam tersini yaptık (sürekli alan, hex
// sınırı tanımıyor) ve fark açıldı: deniz canlı, kara ölü duruyor.
//
// ÇÖZÜM: arazi tipi shader'a sokulur ve doku hexin içinde değişir. Orman
// kümelenmiş taçlara, dağ eğim yönünde sırtlara, çöl kum kıvrımlarına, ova
// hex başına dönen tarla parsellerine ayrışır. Üstüne eğimden kaya,
// yükseklikten kar ve yükseklik alanında yürütülen GERÇEK dağ gölgesi biner.
//
// Renk yine BOYANMAZ: taban haritanın kendi pikselidir (bkz. kirilmaFragment),
// bu katman onu yalnız modüle eder.

/** Arazi sınıfları. Shader tek tek arazi tipiyle değil SINIFLA dallanır. */
export const SINIF = {
  DIGER: 0, ORMAN: 1, DAG: 2, COL: 3, OVA: 4, DONMUS: 5, PLAJ: 6,
};

/** Arazi id -> sınıf. Yeni arazi eklenirse tek yer burası. */
export const SINIF_HARITASI = {
  FOREST: SINIF.ORMAN, JUNGLE: SINIF.ORMAN,
  HILLS: SINIF.DAG, MOUNTAIN: SINIF.DAG, SNOW_PEAK: SINIF.DAG,
  DESERT: SINIF.COL,
  PLAINS: SINIF.OVA, GRASSLAND: SINIF.OVA,
  TUNDRA: SINIF.DONMUS, ICE: SINIF.DONMUS,
  BEACH: SINIF.PLAJ,
};

const KARA_VERTEX = [
  'uniform vec2 uOrigin, uSpan;',
  'varying vec3 vDunya;',
  'void main() {',
  // Deniz gibi: birim kare her karede kameranın altına ölçeklenir. Ama burada
  // yer değiştirme YOK — kara mesh değil, yüzeyin üstüne serilen bir örtü.
  '  vec2 dp = uOrigin + position.xz * uSpan;',
  '  vDunya = vec3(dp.x, 0.0, dp.y);',
  '  gl_Position = projectionMatrix * viewMatrix * vec4(vDunya, 1.0);',
  '}',
].join('\n');

const KARA_FRAGMENT = [
  'uniform sampler2D uArka, uDist, uYuk, uTip, uGurultu, uKiyiK, uSinir, uArazi, uSahip, uUlkeOrt;',
  'uniform vec2 uCozunurluk, uYukBoyut, uGrid;',
  'uniform vec4 uAlan;',
  'uniform vec3 uGunesDir, uKayaCol, uKarCol;',
  'uniform float uHexSize, uDistMax, uHex, uOlcek, uTime;',
  'uniform float uDokuGuc, uKayaGuc, uKarSeviye, uGolgeGuc, uAO, uYukOlcek, uKabartmaK;',
  'uniform float uPlajGen, uPlajGuc, uFalezGuc;',
  'uniform float uSinirGen, uIcOpaklik, uCanlilik, uSinirAzami, uHexYumusat;',
  'uniform float uKenarKalin, uKenarGuc, uHatGuc, uKontrast, uTavan, uIcKarart;',
  'uniform float uKarartmaTaban;',
  'uniform float uCekirdek, uCekirdekGuc, uBantKalin, uBantGuc, uBantDoygun, uBantIsik;',
  'uniform vec3 uCizgiRenk;',
  'uniform vec2 uEkranSpan;',
  'uniform vec3 uPlajCol;',
  'varying vec3 vDunya;',
  '',
  'float nz(vec2 p) { return texture2D(uGurultu, p).r; }',
  '',
  // Hex araması surfaceGL ile AYNI matematiktir. Ayrı bir doğru kurulursa
  // kara dokusu oyunun hexlerinden yarım hex kayar ve kimse sebebini bulamaz.
  'vec2 hexAt(vec2 w) {',
  '  float SQ3 = 1.7320508;',
  '  float r = (w.y * 2.0) / (3.0 * uHexSize);',
  '  float q = w.x / (SQ3 * uHexSize) - r * 0.5;',
  '  float x = q, z = r, y = -q - r;',
  '  float rx = floor(x + 0.5), ry = floor(y + 0.5), rz = floor(z + 0.5);',
  '  float dx = abs(rx - x), dy = abs(ry - y), dz = abs(rz - z);',
  '  if (dx > dy && dx > dz) rx = -ry - rz;',
  '  else if (dy > dz) ry = -rx - rz;',
  '  else rz = -rx - ry;',
  '  return vec2(rx + floor(rz * 0.5), rz);',
  '}',
  '',
  // Orman: kümelenmiş taçlar. Tek ölçekli gürültü "yosun" gibi okunuyordu;
  // iki ölçek + eşik, taçların arasında boşluk bırakıyor ve ağaç kümesi hissi
  // ancak o boşluktan geliyor.
  'float kanopi(vec2 p) {',
  '  float n1 = nz(p * 0.055);',
  '  float n2 = nz(p * 0.140 + 3.1);',
  '  float t = n1 * 0.62 + n2 * 0.38;',
  '  float tac = smoothstep(0.46, 0.66, t);',
  '  float bosluk = smoothstep(0.28, 0.46, t);',
  '  return tac * 0.9 - (1.0 - bosluk) * 0.45;',
  '}',
  '',
  // Dağ: sırtlar eğime DİK uzanır. Gürültüyü o yönde germek, izohipsleri
  // taklit eder — dağ "kahverengi leke" olmaktan çıkar.
  'float sirt(vec2 p, vec2 g) {',
  '  vec2 dik = normalize(vec2(-g.y, g.x) + vec2(1e-5));',
  '  vec2 boy = normalize(g + vec2(1e-5));',
  '  float s = nz(vec2(dot(p, dik) * 0.020, dot(p, boy) * 0.085));',
  '  return (s - 0.5) * 1.6;',
  '}',
  '',
  // Çöl: kum kıvrımları. Düzenli sinüs "oluklu sac" olur; gürültü fazı
  // kaydırınca kıvrım kırılır ve rüzgâr izine benzer.
  'float kum(vec2 p) {',
  '  float faz = nz(p * 0.006) * 7.0;',
  '  return sin(dot(p, vec2(0.86, 0.51)) * 0.085 + faz) * 0.5;',
  '}',
  '',
  // Ova: tarla parselleri. İLK SÜRÜM dönüşü hex kimliğine bağlıyordu ve
  // sonuç ters tepti: desen her hexin sınırında kesildiği için ızgarayı
  // gizlemek yerine ÇİZDİ (ekranda fitilli kumaş gibi okundu). Açı artık
  // kaba bir gürültü alanından geliyor; parseller birkaç hexe yayılıp
  // sınırları geçiyor.
  'float tarla(vec2 p, vec2 cell) {',
  '  float aci = nz(p * 0.011) * 3.14159;',
  '  vec2 d = vec2(cos(aci), sin(aci));',
  '  float parsel = nz(p * 0.02 + 7.3);',
  '  float cizgi = sin(dot(p, d) * 0.30 + parsel * 5.0);',
  '  float kirik = nz(p * 0.08) - 0.5;',
  '  return (cizgi * 0.55 + kirik * 0.45) * 0.40;',
  '}',
  '',
  'void main() {',
  '  vec2 suv = gl_FragCoord.xy / uCozunurluk;',
  '  vec2 auv = (vDunya.xz - uAlan.xy) / uAlan.zw;',
  '  float toLand = texture2D(uDist, auv).r * uDistMax;',
  // Kara maskesi denizin maskesinin TERSİ: ikisi kıyıda tam olarak buluşur,
  // ne boşluk kalır ne bindirme.
  '  float kara = 1.0 - smoothstep(0.0, uHex * 0.22, toLand);',
  '  if (kara <= 0.003) discard;',
  '',
  '  vec2 crE = hexAt(vDunya.xz);',
  '  vec2 cellUV = (vec2(mod(crE.x, uGrid.x), crE.y) + 0.5) / uGrid;',
  '  vec3 ulkeSaf = texture2D(uArka, suv).rgb;',
  // BOŞ ARKA DOKU KORUMASI. Pencere yeniden boyutlandırılınca oyunun tuvali
  // yeniden ayrılır ve BOŞALIR; o kareyi örnekleyen katman bütün kıtayı
  // simsiyah çiziyordu. Doku boşsa hiç çizme: altta oyunun kendi haritası
  // durur. En kötü ihtimal 'iyileştirme yok' olur, asla 'siyah harita' değil.
  '  if (dot(ulkeSaf, vec3(0.3333)) < 0.012) discard;',
  // HEX KADEMESİNİ ERİT. Oyun her hexin rengini biraz farklı yüklüyor;
  // sürekli alanlarla (pigment, kabartma) birleşince harita iki ayrı
  // sistem gibi okunuyor — kullanıcının tarifi buydu. Ülke ortalamasına
  // doğru çekmek kademeyi eritir, sınırı bozmaz: ortalama ülke içinde
  // sabittir, komşuya sızmaz. Yalnız PARLAKLIK çekilir, ton değil —
  // rengin kimliği hexin kendisinde kalır.
  '  vec3 ulkeOrt = texture2D(uUlkeOrt, cellUV).rgb;',
  '  float ulkeL = max(dot(ulkeSaf, vec3(0.299, 0.587, 0.114)), 0.001);',
  '  float ortL = dot(ulkeOrt, vec3(0.299, 0.587, 0.114));',
  '  vec3 taban = ulkeSaf * mix(1.0, ortL / ulkeL, uHexYumusat);',
  '',
  // HOI4 KİPİ. Ülke rengi her yerde aynı kuvvetteyse harita boyama kitabına
  // döner ve altındaki coğrafya kaybolur. Renk SINIRDA kuvvetli, İÇERİDE
  // zayıf olunca iki şey birden okunur: kimin toprağı ve orası nasıl bir yer.
  // Sınıra uzaklık hex cinsinden ayrı bir alandan gelir (çok kaynaklı BFS).
  '  float sinirD = texture2D(uSinir, auv).r * uSinirAzami;',
  '  float icerlek = smoothstep(0.0, max(0.2, uSinirGen * uHex), sinirD);',
  '  vec3 araziRenk = texture2D(uArazi, (cellUV)).rgb;',
  // İLK SÜRÜM ülke rengini arazi rengine doğru KARIŞTIRIYORDU (lerp) ve
  // sonuç suluboyaydı: iki flat renk karışınca doygunluk gider, geriye çamur
  // kalır. HOI4 öyle yapmaz — ülke rengi HER YERDE durur, arazi onun yalnız
  // PARLAKLIĞINI değiştirir. Kimlik (ton + doygunluk) korunur, coğrafya
  // ışıkla anlatılır.
  '  float araziL = dot(araziRenk, vec3(0.299, 0.587, 0.114));',
  '  float araziMod = 0.88 + araziL * 0.40;',
  '  taban *= mix(1.0, araziMod, icerlek * (1.0 - uIcOpaklik));',
  // Bant parlatılmayacaksa okunurluğu İÇERİNİN bir tık kararmasından
  // gelir. Fark küçük olmalı: büyütülürse ülkeler halka gibi görünür.
  '  taban *= mix(1.0, uIcKarart, icerlek);',
  // Canlılık: rengi doygunlaştırır ama parlaklığını korur. Ülke renkleri
  // haritada birbirinden ayrılmalı; soluk palet siyaseti okunmaz yapıyor.
  '  float gri = dot(taban, vec3(0.299, 0.587, 0.114));',
  '  taban = clamp(mix(vec3(gri), taban, 1.0 + uCanlilik), 0.0, 1.0);',
  // Mikro kontrast — ama koyu renkleri EZMEDEN.
  //
  // İlk sürüm 0.5 çevresinde doğrusal geriyordu ve zaten koyu olan ülke
  // renkleri siyaha çakılıyordu (ölçüldü: 0.20 -> 0.095; harita üzerinde
  // birkaç ülke tamamen karardı). Pivot rengin kendi orta bölgesine çekildi
  // ve sonucun altına bir taban kondu: kontrast artık aydınlatır, öldürmez.
  '  vec3 gerilmis = clamp((taban - 0.42) * (1.0 + uKontrast) + 0.42, 0.0, 1.0);',
  '  taban = max(gerilmis, taban * 0.78);',
  '',
  // Yükseklik ve eğim: raster zaten hex başına 4 teksel, merkezî fark yeter.
  '  vec2 tx = 1.0 / uYukBoyut;',
  '  float h = texture2D(uYuk, auv).r;',
  '  float hl = texture2D(uYuk, auv - vec2(tx.x, 0.0)).r;',
  '  float hr = texture2D(uYuk, auv + vec2(tx.x, 0.0)).r;',
  '  float hd = texture2D(uYuk, auv - vec2(0.0, tx.y)).r;',
  '  float hu = texture2D(uYuk, auv + vec2(0.0, tx.y)).r;',
  '  vec2 g = vec2(hr - hl, hu - hd);',
  '  float egim = clamp(length(g) * uKabartmaK * 10.0, 0.0, 1.0);',
  '',
  // Hex hücresi ve arazi sınıfı.
  '  vec2 cr = hexAt(vDunya.xz);',
  '  float sut = mod(cr.x, uGrid.x);',
  '  vec2 cell = vec2(sut, cr.y);',
  '  float sinif = floor(texture2D(uTip, (cell + 0.5) / uGrid).r * 255.0 + 0.5);',
  '',
  // Doku ölçeği EKRANA çivilenir: dünya biriminde sabit tutulunca uzak zoomda
  // piksel altına inip kaynıyor (denizde ölçüldü, aynı hata burada da olurdu).
  '  vec2 p = vDunya.xz / max(1.0, uOlcek);',
  '  float doku = 0.0;',
  '  vec3 tint = vec3(0.0);',
  '  if (sinif < 0.5) { doku = (nz(p * 0.03) - 0.5) * 0.5; }',
  '  else if (sinif < 1.5) { doku = kanopi(p); tint = vec3(-0.012, 0.016, -0.014); }',
  '  else if (sinif < 2.5) { doku = sirt(p, g); tint = vec3(0.010, 0.006, 0.002); }',
  '  else if (sinif < 3.5) { doku = kum(p); tint = vec3(0.016, 0.008, -0.010); }',
  '  else if (sinif < 4.5) { doku = tarla(p, cell); tint = vec3(0.004, 0.010, -0.008); }',
  '  else if (sinif < 5.5) { doku = (nz(p * 0.05) - 0.5) * 0.8; tint = vec3(0.004, 0.008, 0.014); }',
  '  else { doku = (nz(p * 0.09) - 0.5) * 0.7; tint = vec3(0.014, 0.010, -0.004); }',
  '',
  '  vec3 col = taban;',
  '  col *= 1.0 + doku * uDokuGuc;',
  // Ton kaçırma kısıldı: doku RENK eklerse harita boyanmış gibi olur.
  // Doku parlaklıkla konuşur, tonla değil.
  '  col += tint * doku * uDokuGuc * 0.7;',
  '',
  // Eğimden KAYA: dik yamaçta bitki tutunmaz. Yükseklikten KAR: zirve beyazlar.
  '  float kaya = smoothstep(0.55, 0.95, egim) * uKayaGuc;',
  '  col = mix(col, uKayaCol * (0.75 + h * 0.5), kaya * 0.7);',
  // Kar ilk sürümde AMORF BEYAZ LEKE veriyordu: yükseklik alanı yumuşak
  // olduğu için tek eşik geniş bir bölgeyi birden beyazlatıyor ve sonuç kar
  // değil SİS gibi okunuyordu. Eşik gürültüyle kırılır, ve kar yalnız yüksek
  // ve GÖRECE DÜZ zeminde tutar — dik yamaçta zaten tutmaz.
  '  float karKirik = (nz(p * 0.06) - 0.5) * 0.09;',
  '  float kar = smoothstep(uKarSeviye + karKirik, uKarSeviye + karKirik + 0.035, h);',
  '  kar *= (1.0 - kaya * 0.5) * (1.0 - smoothstep(0.45, 0.85, egim) * 0.7);',
  '  col = mix(col, uKarCol, kar * 0.55);',
  '',
  // KIYI KUŞAĞI. Karanın tarafında denize uzaklık alanı (bkz.
  // denizUzakligiDokusu) plajın nereye kadar uzanacağını söyler. Kıyı DÜZSE
  // geniş kum, DİKSE falez: aynı bant, eğime göre iki ayrı okuma. Suyun sığ
  // turkuazı tam burada bittiği için kıyı artık kesik değil GEÇİŞ.
  '  float toSea = texture2D(uKiyiK, auv).r * uDistMax;',
  '  float kirik = (nz(p * 0.05) - 0.5) * uHex * 0.5;',
  '  float bant = 1.0 - smoothstep(0.0, uHex * uPlajGen + kirik, toSea);',
  '  float falez = smoothstep(0.22, 0.60, egim);',
  '  col = mix(col, uPlajCol, bant * (1.0 - falez) * uPlajGuc);',
  '  col = mix(col, uKayaCol * 0.62, bant * falez * uFalezGuc);',
  '',
  // DAĞ GÖLGESİ: yükseklik alanında güneşe doğru ışın yürütülür. Gölge
  // haritası, FBO yok — alan zaten dokuda, yürümek en ucuzu.
  '  float golge = 1.0;',
  '  if (uGolgeGuc > 0.001) {',
  '    vec2 gDir = -normalize(uGunesDir.xz + vec2(1e-5));',
  '    float tanY = uGunesDir.y / max(0.12, length(uGunesDir.xz));',
  '    float adim = uHex * 0.5;',
  '    for (int i = 1; i <= 14; i++) {',
  '      float t = adim * float(i);',
  '      vec2 sp = vDunya.xz + gDir * t;',
  '      float hs = texture2D(uYuk, (sp - uAlan.xy) / uAlan.zw).r;',
  '      float gerek = h + tanY * t / max(1.0, uYukOlcek);',
  '      golge = min(golge, 1.0 - step(gerek, hs) * 0.9);',
  '    }',
  // Sert kesilmesin: gölgenin kenarı yumuşasın, yoksa dağ "makasla kesilmiş"
  // görünür.
  '    golge = mix(1.0, golge, uGolgeGuc);',
  '  }',
  '  col *= mix(1.0, 0.62, 1.0 - golge);',
  '',
  // Çukur karanlığı (kaba ortam tıkanımı): komşulardan alçakta kalan yer
  // daha az gökyüzü görür.
  '  float komsu = (hl + hr + hd + hu) * 0.25;',
  '  float cukur = clamp((komsu - h) * 30.0, 0.0, 1.0);',
  '  col *= 1.0 - cukur * uAO * 0.5;',
  '',
  // SINIR ŞERİDİ. Siyah mürekkep yerine her ülke KENDİ renginde: şerit
  // sınırın iki yakasında ayrı ayrı çizildiği için karşılıklı iki yarım
  // oluşur. En sonda biner — dokunun, gölgenin ve plajın üstünde kalmalı,
  // yoksa çizgi bulanır ve yarım yarım okunmaz.
  // ŞERİT: ülkenin KENDİ rengi, PARLATILMADAN.
  //
  // İlk sürüm şeridi ulkeSaf * 1.5 + 0.05 ile parlatıyordu ve bazı ülke
  // renkleri (sarı, camgöbeği) tavana çarpıp NEON gibi yanıyordu. Bant artık
  // rengin kendisidir; okunurluğu parlatmadan değil, İÇERİNİN bir tık
  // karartılmasından geliyor. Sınırın iki yakasında ayrı ayrı çizildiği için
  // yeşilin tarafı yeşil kalınlık, kırmızının tarafı kırmızı kalınlık olur.
  '  float kenar = 1.0 - smoothstep(uKenarKalin * uHex * 0.62, uKenarKalin * uHex, sinirD);',
  // Parlaklık tavanı: doygun ama TAŞMAYAN bant. Rengin tonu korunur, yalnız
  // parlaklığı tavana çekilir.
  '  float sl = dot(ulkeSaf, vec3(0.299, 0.587, 0.114));',
  '  vec3 kenarRenk = ulkeSaf * min(1.0, uTavan / max(sl, 0.001));',
  '  col = mix(col, kenarRenk, kenar * uKenarGuc);',
  // Şeridin DIŞ kenarında ince koyu bir hat. Haritayı suluboyadan çıkaran
  // şey yumuşak geçiş değil, tek bir KESKİN kenardır; göz oraya tutunur.
  '  float hat = (1.0 - smoothstep(0.0, uKenarKalin * uHex * 0.30, sinirD))',
  '            * smoothstep(0.0, uKenarKalin * uHex * 0.10, sinirD);',
  '  col *= 1.0 - hat * uHatGuc * 0.55;',
  '',
  // KARARTMA TABANI.
  //
  // Arazi modülasyonu, iç karartma, dağ gölgesi, çukur karanlığı ve kontrast
  // hepsi ÇARPILARAK biniyor. Tek tek masum olan bu terimler koyu bir ülke
  // renginde birleşince toplam çarpan 0.5'in altına iniyor ve ülke siyah
  // görünüyordu (kullanıcı ekranda gösterdi). Toplam karartma, ülkenin kendi
  // rengine göre sınırlanır — gölge kalır, ama rengi öldüremez.
  '  col = max(col, ulkeSaf * uKarartmaTaban);',
  '',
  '  vec2 cellQR = vec2(cell.x - floor(cell.y * 0.5), cell.y);',
  '  vec2 merkez = vec2(uHexSize * 1.7320508 * (cellQR.x + cellQR.y * 0.5),',
  '                     uHexSize * 1.5 * cellQR.y);',
  '  vec2 rel = vDunya.xz - merkez;',
  '  float icYaricap = uHexSize * 1.7320508 * 0.5;',
  // SINIR — İKİ PARÇALI.
  //
  // Bu bölüm iki kez ters uca savruldu ve ikisini de kullanıcı ekranda gördü:
  //   · Koyu mürekkep tek parça: sınırın iki yakası ayrı ayrı çizdiği için
  //     görünen kalınlık iki kat; altı kenarı da sınır olan hex çepeçevre
  //     kapanıp "çizgi" değil KARANLIK HEX oluyordu (ölçüldü: yoğun bölgede
  //     kara pikselinin %12-18'i).
  //   · Rengi ülkenin tonuna çekmek: siyahlık gitti ama çizgi de ÖLDÜ, çünkü
  //     hat bindiği ülkenin renginin koyusuydu — kontrast yok.
  //
  // Doğrusu ikisini AYIRMAK. Sınır iki ayrı işi olan iki parçadan oluşur:
  //
  //   ÇEKİRDEK  tam kenarda, ekran pikselinde SABİT ve çok ince koyu hat.
  //             Ayrımı garanti eder. İnce olduğu için hexi asla dolduramaz:
  //             1 px'lik çekirdek 27 px'lik hexin %7'sini kaplar, 54 px'lik
  //             hexin %3,5'ini.
  //   BANT      çekirdeğin İÇ tarafında, ülkenin kendi renginin doygun ve
  //             hafif parlak hâli. Kimliği taşır ("yeşilin tarafı yeşil
  //             kalınlık"), ama KARARTMAZ — tersine biraz açar.
  //
  // Bant karartmadığı için genişleyebilir; çekirdek karartır ama incedir.
  //
  // ÖLÇÜLDÜ (zoom 0.75, sınırın yoğun olduğu bölge, kara pikselleri içinde
  // siyah sayılan oran): kalın çekirdek %12.6, çekirdek kapalı %0.1. Yani
  // karartmanın tamamı çekirdekten geliyordu, bandın katkısı sıfır. Bu
  // yüzden varsayılanda çekirdek ince ve zayıf, bant geniş ve güçlü.
  '  float pikselDunya = uEkranSpan.x / max(1.0, uCozunurluk.x);',
  '  float benimSahip = texture2D(uSahip, (cell + 0.5) / uGrid).r;',
  '  float cekirdekY = max(0.5, uCekirdek * 0.5) * pikselDunya;',
  '  float bantY = max(cekirdekY, uBantKalin * 0.5 * pikselDunya);',
  // Emniyet supabı: hiçbir parça hexin payını aşamaz. Aşarsa uzak zoomda
  // yoğun bölge gene dolar.
  '  cekirdekY = min(cekirdekY, icYaricap * 0.06);',
  '  bantY = min(bantY, icYaricap * 0.20);',
  '  float cekirdek = 0.0;',
  '  float ulkeBant = 0.0;',
  '  for (int i = 0; i < 6; i++) {',
  '    float aci = 1.0471976 * float(i);',
  '    vec2 nrm = vec2(cos(aci), sin(aci));',
  '    float kenarD = icYaricap - dot(rel, nrm);',
  '    if (kenarD > bantY * 2.0) continue;',
  '    vec2 dq = vec2(0.0);',
  '    if (i == 0) dq = vec2(1.0, 0.0);',
  '    else if (i == 1) dq = vec2(0.0, 1.0);',
  '    else if (i == 2) dq = vec2(-1.0, 1.0);',
  '    else if (i == 3) dq = vec2(-1.0, 0.0);',
  '    else if (i == 4) dq = vec2(0.0, -1.0);',
  '    else dq = vec2(1.0, -1.0);',
  '    vec2 kQR = cellQR + dq;',
  '    vec2 kCell = vec2(kQR.x + floor(kQR.y * 0.5), kQR.y);',
  '    kCell.x = mod(kCell.x, uGrid.x);',
  '    if (kCell.y < 0.0 || kCell.y > uGrid.y - 1.0) continue;',
  '    float kSahip = texture2D(uSahip, (kCell + 0.5) / uGrid).r;',
  // Deniz ve sahipsiz komşuya sınır çizilmez: kıyıyı zaten suyun kendisi
  // anlatıyor, oraya hat koyunca harita kafese dönüyor.
  '    if (kSahip > 0.99 || benimSahip > 0.99) continue;',
  '    if (abs(kSahip - benimSahip) < 0.002) continue;',
  '    cekirdek = max(cekirdek, 1.0 - smoothstep(cekirdekY * 0.55, cekirdekY * 1.45, kenarD));',
  '    ulkeBant = max(ulkeBant, 1.0 - smoothstep(bantY * 0.55, bantY * 1.25, kenarD));',
  '  }',
  // Sönüm: hex ekranda küçülürken önce bant, sonra çekirdek incelir. Uzak
  // zoomda ayrımı rengin kendisi yapar.
  '  float hexPiksel = icYaricap * 2.0 / max(0.001, pikselDunya);',
  '  float sol = smoothstep(11.0, 26.0, hexPiksel);',
  // Bant: ülkenin rengi, doygunlaştırılmış ve bir tık açılmış. Parlaklık
  // tavanı sarı/camgöbeği gibi zaten parlak ülkelerin neon yanmasını keser.
  '  float bl = dot(ulkeSaf, vec3(0.299, 0.587, 0.114));',
  '  vec3 bantRenk = mix(vec3(bl), ulkeSaf, 1.0 + uBantDoygun) * (1.0 + uBantIsik);',
  '  bantRenk *= min(1.0, uTavan / max(dot(bantRenk, vec3(0.299, 0.587, 0.114)), 0.001));',
  '  col = mix(col, clamp(bantRenk, 0.0, 1.0), ulkeBant * uBantGuc * sol);',
  '  col = mix(col, uCizgiRenk, cekirdek * uCekirdekGuc * sol);',
  '',
  '  gl_FragColor = vec4(col, kara);',
  '}',
].join('\n');

/**
 * Kara katmanı kurar.
 *
 * @param ortak  denizle PAYLAŞILAN uniformlar (uArka, uDist, uAlan, uGurultu,
 *   uOrigin, uSpan, uCozunurluk, uOlcek, uTime, uGunesDir, uDistMax, uHex).
 *   Paylaşmak zorunlu: iki katman aynı kadrajı ve aynı güneşi görmeli, yoksa
 *   kıyıda iki ayrı dünya buluşur.
 */
export function karaKatmani(THREE, ortak, { tipTex, yukTex, kiyiTex, sinirTex, araziTex, sahipTex, ulkeOrtTex, sinirAzami, yukBoyut, grid, hexSize }) {
  const U = {
    ...ortak,
    uTip: { value: tipTex },
    uYuk: { value: yukTex },
    uYukBoyut: { value: new THREE.Vector2(yukBoyut.w, yukBoyut.h) },
    uGrid: { value: new THREE.Vector2(grid.cols, grid.rows) },
    uHexSize: { value: hexSize },
    uKayaCol: { value: new THREE.Color('#6e6a63') },
    uKarCol: { value: new THREE.Color('#dfe6e8') },
    uDokuGuc: { value: 0.22 },
    uKayaGuc: { value: 0.45 },
    uKarSeviye: { value: 0.96 },
    uGolgeGuc: { value: 0.42 },
    uAO: { value: 0.35 },
    uYukOlcek: { value: 1400 },
    uKabartmaK: { value: 1.0 },
    uKiyiK: { value: kiyiTex },
    uPlajCol: { value: new THREE.Color('#d8c79a') },
    uPlajGen: { value: 0.55 },
    uPlajGuc: { value: 0.45 },
    uFalezGuc: { value: 0.5 },
    uSinir: { value: sinirTex },
    uArazi: { value: araziTex },
    uSinirAzami: { value: sinirAzami },
    uSinirGen: { value: 6.0 },
    uIcOpaklik: { value: 0.85 },
    uCanlilik: { value: 0.0 },
    uUlkeOrt: { value: ulkeOrtTex },
    uHexYumusat: { value: 0.6 },
    uKenarKalin: { value: 0.42 },
    uKenarGuc: { value: 0.0 },
    uHatGuc: { value: 0.0 },
    uTavan: { value: 0.62 },
    uIcKarart: { value: 0.94 },
    uSahip: { value: sahipTex },
    uCekirdek: { value: 0.8 },      // koyu hat, ekran pikseli
    uCekirdekGuc: { value: 0.35 },
    uBantKalin: { value: 7.0 },     // ülke rengi bandı, ekran pikseli
    uBantGuc: { value: 1.0 },
    uBantDoygun: { value: 0.55 },   // bandın doygunluk artışı
    uBantIsik: { value: 0.22 },     // bandın parlaklık artışı
    uKarartmaTaban: { value: 0.62 },
    uCizgiRenk: { value: new THREE.Color('#0c1116') },
    uKontrast: { value: 0.35 },
  };

  const geo = new THREE.PlaneGeometry(1, 1, 1, 1);
  geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, new THREE.ShaderMaterial({
    uniforms: U,
    vertexShader: KARA_VERTEX,
    fragmentShader: KARA_FRAGMENT,
    transparent: true,
    depthWrite: false,
    depthTest: false,
  }));
  mesh.frustumCulled = false;
  return { mesh, U };
}

/**
 * KARADA denize uzaklık alanı (R8, LINEAR).
 *
 * Oyunun elinde `toLand` var — DENİZDE karaya uzaklık. Karanın tarafında o
 * alan her yerde sıfırdır, yani plajın nerede biteceğini söylemez. Tersi
 * alan hiç üretilmiyor, burada üretiliyor: iki geçişli chamfer (3-4) yeter,
 * kesin Öklid mesafesi gerekmez — plaj bandının kenarı zaten yumuşak.
 *
 * Doğu-batı sarmalı korunur: x ekseninde komşuluk dünyanın kenarından döner,
 * yoksa haritanın iki yakasında plaj birden kesilir.
 */
export function denizUzakligiDokusu(THREE, cache, distMax) {
  const { w, h, toLand } = cache;
  const INF = 1e9;
  const d = new Float32Array(w * h);
  for (let i = 0; i < d.length; i++) d[i] = toLand[i] > 0 ? 0 : INF;

  const A = 3, B = 4;                      // chamfer 3-4: hata < %2
  const sar = (x) => (x < 0 ? x + w : (x >= w ? x - w : x));
  const bak = (i, x, y, dx, dy, m) => {
    const ny = y + dy;
    if (ny < 0 || ny >= h) return;
    const v = d[ny * w + sar(x + dx)] + m;
    if (v < d[i]) d[i] = v;
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      bak(i, x, y, -1, -1, B); bak(i, x, y, 0, -1, A);
      bak(i, x, y, 1, -1, B); bak(i, x, y, -1, 0, A);
    }
  }
  for (let y = h - 1; y >= 0; y--) {
    for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x;
      bak(i, x, y, 1, 1, B); bak(i, x, y, 0, 1, A);
      bak(i, x, y, -1, 1, B); bak(i, x, y, 1, 0, A);
    }
  }

  // Chamfer birimi -> dünya birimi -> distMax'a göre normalize.
  const hucre = cache.width / w;
  const veri = new Uint8Array(w * h);
  for (let i = 0; i < veri.length; i++) {
    const dunya = (d[i] / A) * hucre;
    veri[i] = Math.min(255, Math.round((dunya / distMax) * 255));
  }
  const tex = new THREE.DataTexture(veri, w, h, THREE.RedFormat);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.minFilter = tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

/**
 * SINIRA uzaklık alanı — hex ızgarasında değil RASTERDE.
 *
 * İlk sürüm uzaklığı hex başına hesaplıyordu ve doku hex çözünürlüğündeydi.
 * Sonuç kademeliydi: ülke rengi sınırdan içeri altıgen basamaklarla iniyordu
 * ve harita boya lekesi gibi okunuyordu. Uzaklık artık yükseklik rasteriyle
 * aynı çözünürlükte (hex başına ~4 teksel) çıkarılıyor, yani alan gerçek
 * sınır ÇİZGİSİNİ takip ediyor — geçiş sürekli, hexten bağımsız.
 *
 * Sahip rasteri bir kez kurulur (dünya -> hex -> sahip), sınır hücreleri
 * işaretlenir ve iki geçişli chamfer (3-4) alanı doldurur. Doğu-batı sarmalı
 * korunur.
 */
export function sinirAlaniDokusu(THREE, world, cache, hexSize, azamiHex = 6) {
  const { w, h, x0, y0, width, height } = cache;
  const { cols, rows } = world;
  const SQ3 = Math.sqrt(3);
  const hucreW = width / w;
  const hucreH = height / h;

  // 1) Sahip rasteri. -2 = deniz/boşluk, -1 = sahipsiz kara, >=0 ülke.
  const sahip = new Int16Array(w * h);
  for (let j = 0; j < h; j++) {
    const wy = y0 + (j + 0.5) * hucreH;
    for (let i = 0; i < w; i++) {
      const wx = x0 + (i + 0.5) * hucreW;
      // dünya -> eksenel hex (pointy-top), sonra küp yuvarlama
      const r = (wy * 2) / (3 * hexSize);
      const q = wx / (SQ3 * hexSize) - r * 0.5;
      let cx = q, cz = r, cy = -q - r;
      let rx = Math.round(cx), ry = Math.round(cy), rz = Math.round(cz);
      const dx = Math.abs(rx - cx), dy = Math.abs(ry - cy), dz = Math.abs(rz - cz);
      if (dx > dy && dx > dz) rx = -ry - rz;
      else if (dy > dz) ry = -rx - rz;
      else rz = -rx - ry;
      const col = ((rx + Math.floor(rz / 2)) % cols + cols) % cols;
      const row = rz;
      const t = (row >= 0 && row < rows) ? world.tiles[row * cols + col] : null;
      sahip[j * w + i] = (!t || t.terrain.water) ? -2 : t.owner;
    }
  }

  // 2) Sınır hücreleri: komşusunun sahibi farklı olan KARA hücresi. Kıyı da
  // sınırdır — denize bakan kenar da kendini göstermeli.
  const INF = 1e9;
  const d = new Float32Array(w * h).fill(INF);
  const sar = (x) => (x < 0 ? x + w : (x >= w ? x - w : x));
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const k = j * w + i;
      if (sahip[k] === -2) continue;
      const s = sahip[k];
      const komsu = [
        sahip[j * w + sar(i - 1)], sahip[j * w + sar(i + 1)],
        j > 0 ? sahip[(j - 1) * w + i] : -2,
        j < h - 1 ? sahip[(j + 1) * w + i] : -2,
      ];
      if (komsu.some((v) => v !== s)) d[k] = 0;
    }
  }

  // 3) Chamfer 3-4, iki geçiş.
  const A = 3, B = 4;
  const bak = (k, x, y, dx2, dy2, m) => {
    const ny = y + dy2;
    if (ny < 0 || ny >= h) return;
    const v = d[ny * w + sar(x + dx2)] + m;
    if (v < d[k]) d[k] = v;
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const k = y * w + x;
      bak(k, x, y, -1, -1, B); bak(k, x, y, 0, -1, A);
      bak(k, x, y, 1, -1, B); bak(k, x, y, -1, 0, A);
    }
  }
  for (let y = h - 1; y >= 0; y--) {
    for (let x = w - 1; x >= 0; x--) {
      const k = y * w + x;
      bak(k, x, y, 1, 1, B); bak(k, x, y, 0, 1, A);
      bak(k, x, y, -1, 1, B); bak(k, x, y, 1, 0, A);
    }
  }

  const azami = azamiHex * SQ3 * hexSize;      // dünya birimi
  const veri = new Uint8Array(w * h);
  for (let k = 0; k < veri.length; k++) {
    const dunya = (d[k] / A) * hucreW;
    veri[k] = Math.min(255, Math.round((dunya / azami) * 255));
  }
  const tex = new THREE.DataTexture(veri, w, h, THREE.RedFormat);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.minFilter = tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return { tex, azami };
}

/**
 * Hex başına ARAZİ rengi (RGBA8, NEAREST) — TERRAIN paletinden.
 *
 * Ülke rengi içeride zayıflayınca altından ne çıkacağı sorusunun cevabı bu.
 * Oyunun coğrafya kipinde gösterdiği rengin aynısı; ayrı bir palet uydurmak
 * "aynı oyunda iki ayrı sanat yönetimi" demek olurdu.
 */
export function araziRenkDokusu(THREE, world) {
  const { cols, rows } = world;
  const veri = new Uint8Array(cols * rows * 4);
  const cek = (hex) => {
    const s = hex.replace('#', '');
    return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
  };
  const bellek = new Map();
  for (let i = 0; i < cols * rows; i++) {
    const t = world.tiles[i];
    const renk = t?.terrain?.color ?? '#000000';
    let rgb = bellek.get(renk);
    if (!rgb) { rgb = cek(renk); bellek.set(renk, rgb); }
    const p = i * 4;
    veri[p] = rgb[0]; veri[p + 1] = rgb[1]; veri[p + 2] = rgb[2]; veri[p + 3] = 255;
  }
  const tex = new THREE.DataTexture(veri, cols, rows, THREE.RGBAFormat);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  // LINEAR — NEAREST DEĞİL. Bu doku gösterim için değil MODÜLASYON için
  // kullanılıyor: arazinin parlaklığı ülke rengini çarpıyor. NEAREST olunca
  // coğrafya hexe kilitleniyor ve harita iki ayrı sistem gibi okunuyor —
  // hex hex kademeli tonlar ile hexi umursamayan bulutlar yan yana.
  // Ölçüldü: aynı ülkedeki komşu hexler arası ortalama parlaklık farkı yalnız
  // oyunda 5.18, bu katman NEAREST iken 9.37. Kural: SİYASET hex bazlı
  // (oyunun kuralı), COĞRAFYA sürekli.
  tex.minFilter = tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Hex başına ÜLKE ORTALAMA rengi (RGBA8, NEAREST).
 *
 * Oyun her hexin siyasi rengini biraz farklı yüklüyor (ölçüldü: 214 hexlik
 * Drailand için 15 ayrı renk, 106..125 aralığında). Bu, sürekli alanlarla
 * (pigment, kabartma) birleşince harita "hem hex bazlı hem hex bazsız"
 * okunuyor — kullanıcının tarifi buydu.
 *
 * Ülke ortalamasına doğru yumuşatmak bu kademeyi eritir ama SINIRI bozmaz:
 * ortalama ülke içinde sabit olduğu için komşu ülkeyle karışma olmaz.
 * Bilineer bir bulanıklaştırma bunu yapamazdı — sınırın iki yakasını
 * birbirine akıtırdı.
 */
export function ulkeOrtalamaDokusu(THREE, world, ownerVeri) {
  const { cols, rows } = world;
  const topla = new Map();
  for (let i = 0; i < cols * rows; i++) {
    const t = world.tiles[i];
    if (!t || t.terrain.water || t.owner < 0) continue;
    const p = i * 4;
    const o = topla.get(t.owner) ?? { r: 0, g: 0, b: 0, n: 0 };
    o.r += ownerVeri[p]; o.g += ownerVeri[p + 1]; o.b += ownerVeri[p + 2]; o.n++;
    topla.set(t.owner, o);
  }
  const veri = new Uint8Array(cols * rows * 4);
  for (let i = 0; i < cols * rows; i++) {
    const t = world.tiles[i];
    const p = i * 4;
    const o = (t && !t.terrain.water && t.owner >= 0) ? topla.get(t.owner) : null;
    if (o) {
      veri[p] = Math.round(o.r / o.n);
      veri[p + 1] = Math.round(o.g / o.n);
      veri[p + 2] = Math.round(o.b / o.n);
    } else {
      veri[p] = ownerVeri[p]; veri[p + 1] = ownerVeri[p + 1]; veri[p + 2] = ownerVeri[p + 2];
    }
    veri[p + 3] = 255;
  }
  const tex = new THREE.DataTexture(veri, cols, rows, THREE.RGBAFormat);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.minFilter = tex.magFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  return tex;
}


/**
 * Hex başına SAHİP kimliği (R8, NEAREST).
 *
 * Sınır çizgisi "komşumun sahibi benden farklı mı" sorusunu piksel piksel
 * sorar; cevabı ancak bu doku verebilir. 255 = deniz ya da sahipsiz — o
 * kenarlarda çizgi çizilmez, kıyıyı zaten suyun kendisi anlatıyor.
 */
export function sahipDokusu(THREE, world) {
  const { cols, rows } = world;
  const veri = new Uint8Array(cols * rows);
  for (let i = 0; i < veri.length; i++) {
    const t = world.tiles[i];
    veri[i] = (!t || t.terrain.water || t.owner < 0) ? 255 : Math.min(253, t.owner);
  }
  const tex = new THREE.DataTexture(veri, cols, rows, THREE.RedFormat);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.minFilter = tex.magFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  return tex;
}

/** Hex başına arazi SINIFI dokusu (R8, NEAREST). */
export function tipDokusu(THREE, world) {
  const { cols, rows } = world;
  const veri = new Uint8Array(cols * rows);
  for (let i = 0; i < veri.length; i++) {
    const t = world.tiles[i];
    veri[i] = SINIF_HARITASI[t?.terrain?.id] ?? SINIF.DIGER;
  }
  const tex = new THREE.DataTexture(veri, cols, rows, THREE.RedFormat);
  tex.wrapS = THREE.RepeatWrapping;      // doğu-batı sarmalı
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.minFilter = tex.magFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  return tex;
}

/** Yükseklik rasteri (R8, LINEAR) — oyunun kendi yüzey alanından. */
export function yukseklikDokusu(THREE, cache) {
  const veri = new Uint8Array(cache.surface.length);
  for (let i = 0; i < veri.length; i++) {
    veri[i] = Math.max(0, Math.min(255, Math.round(cache.surface[i] * 255)));
  }
  const tex = new THREE.DataTexture(veri, cache.w, cache.h, THREE.RedFormat);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.minFilter = tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}
