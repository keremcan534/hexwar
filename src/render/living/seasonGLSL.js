// MEVSİMİN KARA MALZEMESİ — SurfaceGL'in bütün programlarına (klasik + stiller) girer.
//
// Kar ve yaprak rengi ayrı bir örtü olarak değil KARA RENGİNİN ÜSTÜNDE, aynı
// geçişte hesaplanır: kıyı ve sınır eğrisi piksel piksel oyunun kendisidir,
// eğik kamerada dağa da oturur ve fazladan çizim geçişi ödenmez.
//
// Ek doku birimi yok: stil programları 16 birimin hepsini kullanıyor. İklim
// verisi yükseklik dokusunun boş kanallarında gelir (bkz. climate.js), gürültü
// zaten bağlı olan dalga dokusundan okunur.
//
// uSeasonOn 0 iken işlev rengi dokunmadan döndürür: kapalı katman bugünkü
// haritanın aynısıdır.

export const SEASON_UNIFORMS = ['uSeasonOn', 'uSeasonS', 'uSeasonCool', 'uSeasonCap', 'uSeasonLeaf'];

export const SEASON_GLSL = `
uniform float uSeasonOn;    // 1 = mevsim çizilsin
uniform float uSeasonS;     // +1 kuzey yazı, -1 kuzey kışı
uniform float uSeasonCool;  // >0 kuzey soğuyor
uniform float uSeasonCap;   // karın ülke rengini örtme payı
uniform float uSeasonLeaf;  // yaprak renginin payı

vec3 seasonLand(vec3 col, vec2 world, vec3 Ldir) {
  if (uSeasonOn < 0.5) return col;
  vec2 uv = (world - uFieldOrigin) / uFieldSpan;
  vec4 c = texture(uElev, uv);
  float mean = c.b * 90.0 - 40.0;
  float amp = (c.a - 0.5) * 80.0;
  float tC = mean + amp * uSeasonS;
  // Dalga dokusu döşenir; hücre sayısı tam sayı olduğu için sarmal dikişi yok.
  vec2 q = world / uFieldSpan.x;
  float n1 = texture(uWave, q * 9.0).b - 0.5;
  float n2 = texture(uWave, q * 37.0 + 0.37).a - 0.5;
  float n3 = texture(uWave, q * 149.0 + 0.71).b - 0.5;
  float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));

  // --- YAPRAK ---
  // Yalnız yaprak döken kuşak: iğne yapraklı kuzey ve tropik orman yeşil kalır.
  float forest = c.g;
  if (forest > 0.02 && uSeasonLeaf > 0.0) {
    float belt = smoothstep(-1.0, 4.0, mean) * (1.0 - smoothstep(17.0, 23.0, mean));
    float cool = uSeasonCool * (amp >= 0.0 ? 1.0 : -1.0);
    float turn = smoothstep(0.28, 0.72, cool) * (1.0 - smoothstep(-2.0, 3.0, 2.0 - tC));
    float patches = smoothstep(0.30, 0.62, 0.5 + n2 * 1.4 + n3 * 0.8);
    vec3 leaf = mix(vec3(0.68, 0.36, 0.11), vec3(0.76, 0.57, 0.17), smoothstep(0.38, 0.62, 0.5 + n2));
    leaf = mix(leaf, vec3(0.54, 0.20, 0.10), smoothstep(0.55, 0.82, 0.5 + n1 * 1.5));
    // Parlaklık korunur: sonbahar haritayı ne açar ne karartır.
    leaf *= luma / max(dot(leaf, vec3(0.2126, 0.7152, 0.0722)), 0.05);
    col = mix(col, leaf, forest * belt * turn * patches * uSeasonLeaf);
    // Kış ormanı hafifçe solar; ülke rengi griye dönmez, siyasi okuma kalır.
    float bare = belt * forest * (1.0 - smoothstep(1.0, 8.0, tC));
    col = mix(col, mix(vec3(luma), col, 0.62) * vec3(1.02, 0.99, 0.95), bare * 0.42 * uSeasonLeaf);
  }

  // --- KAR ---
  // Kar çizgisini iklim çizer, gürültü yalnız kenarını kırar: geniş ölçekli
  // gürültü kıtanın üstünde bulut lekesi gibi duruyordu. Geçiş dar tutulur,
  // yarım kar geniş alanda sis gibi okunur.
  float n4 = texture(uWave, q * 521.0 + 0.13).a - 0.5;
  // Gecikme (climate.js SNOW_LAG): ilkbaharda kar geç erir, sonbaharda geç tutar.
  float edge = tC + amp * uSeasonCool * 0.28 + n1 * 1.0 + n2 * 1.8 + n3 * 2.2 + n4 * 1.4;
  float snow = 1.0 - smoothstep(-1.0, -0.1, edge);
  if (snow <= 0.0) return col;
  float h;
  vec2 g = elevGrad(uv, h);
  vec3 N = normalize(vec3(g * 18.0 * uLandRelief, 1.0));
  // Karın kabartması: düz zeminde 1, güneye dönük yamaç parlar, kuzey gölgede.
  float lit = clamp(dot(N, Ldir) / Ldir.z, 0.62, 1.22);
  vec3 white = vec3(0.86, 0.90, 0.94) * lit;
  // Ülke rengi karın altından hafifçe duyulur: kışın da harita siyasi kalır.
  vec3 hue = clamp(col / max(luma, 0.05), 0.72, 1.28);
  return mix(col, white * mix(vec3(1.0), hue, 0.24), snow * uSeasonCap);
}
`;
