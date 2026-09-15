// Deniz kuşları — haritanın üstünde yaşayan ayrı bir katman.
//
// Neden ayrı dosya: kuşun deniz shaderiyle hiçbir ortak matematiği yok. Aynı
// malzemeye tıkıştırılsaydı su ayarları kuşu, kuş ayarları suyu bozardı.
//
// Neden THREE.Points: her kuş TEK bir vertex. Konum, kanat çırpma fazı ve
// sürü davranışı tamamen vertex shader'da üretilir — CPU her karede iki bin
// nesne güncellemez, JS tarafı yalnız bir zaman değeri gönderir.
//
// TEPEDEN BAKIŞIN SORUNU: ortografik ve dik bakan bir kamerada yükseklik
// PARALAKS ÜRETMEZ; kuş 200 metre yukarıda da olsa ekranda aynı yerdedir,
// yani uçtuğu anlaşılmaz. Bu yüzden kuşun kendisi ekran uzayında sabit bir
// miktar kaydırılır ve suya GÖLGESİ düşürülür: yükseklik hissi o iki nokta
// arasındaki mesafeden gelir. Sinema numarası, ama tek çalışan numara bu.

const KUS_VERTEX = [
  'attribute float aTohum;',
  'uniform float uTime, uHiz, uYukseklik, uPikselDunya, uBoyut, uYon, uSayiOran;',
  'uniform vec4 uAlan;',
  'uniform sampler2D uDist;',
  'uniform float uDistMax, uHex, uKiyiSevgisi;',
  'varying float vCirpma;',
  'varying float vGolge;',
  'varying float vGoster;',
  'float rast(float t) { return fract(sin(t * 127.1) * 43758.5453); }',
  'void main() {',
  '  float t = aTohum;',
  '  vGolge = step(0.5, fract(t * 91.7));',        // her kuş için bir gölge ikizi
  '  float bt = floor(t);',                        // kuş kimliği
  // Sürü: kuşlar tek tek dağılmaz, birkaç merkezin çevresinde toplanır.
  '  float suru = floor(rast(bt * 3.7) * 24.0);',
  '  vec2 sMerkez = vec2(rast(suru * 5.3), rast(suru * 9.1)) * uAlan.zw + uAlan.xy;',
  '  float sYon = uYon + (rast(suru * 2.9) - 0.5) * 1.2;',
  '  vec2 dYon = vec2(cos(sYon), sin(sYon));',
  // Sürü içi dağılım + kanat çırpmasıyla senkron olmayan küçük salınım.
  '  vec2 sapma = (vec2(rast(bt * 7.7), rast(bt * 11.3)) - 0.5) * uHex * 14.0;',
  '  float faz = rast(bt * 13.1) * 6.2831853;',
  '  vec2 dp = sMerkez + sapma + dYon * (uTime * uHiz * (18.0 + rast(bt * 17.3) * 10.0));',
  '  dp += vec2(cos(uTime * 0.7 + faz), sin(uTime * 0.9 + faz)) * uHex * 0.9;',
  // Dünya sarmalı: kuş haritanın doğusundan çıkıp batısından girer.
  '  dp.x = uAlan.x + mod(dp.x - uAlan.x, uAlan.z);',
  '  dp.y = uAlan.y + mod(dp.y - uAlan.y, uAlan.w);',
  // Kuşlar KIYIYI sever: açık okyanusun ortasında martı sürüsü olmaz.
  '  float kiyi = texture2D(uDist, (dp - uAlan.xy) / uAlan.zw).r * uDistMax;',
  '  float denizMi = step(uHex * 0.25, kiyi);',
  '  float yakinlik = 1.0 - smoothstep(uHex * 2.0, uHex * 22.0, kiyi);',
  '  float sec = step(rast(bt * 23.9), uSayiOran);',
  '  vGoster = denizMi * sec * mix(1.0, yakinlik, uKiyiSevgisi);',
  '  vCirpma = 0.5 + 0.5 * sin(uTime * (7.0 + rast(bt * 29.3) * 4.0) + faz);',
  // Gölge suda durur, kuş yukarıda: ekran uzayında sabit bir kayma.
  '  vec2 kayma = vGolge > 0.5 ? vec2(0.0) : vec2(0.0, -uYukseklik * uPikselDunya);',
  '  vec4 mv = viewMatrix * vec4(dp.x + kayma.x, 0.0, dp.y + kayma.y, 1.0);',
  '  gl_Position = projectionMatrix * mv;',
  '  gl_PointSize = uBoyut * (vGolge > 0.5 ? 0.85 : 1.0) * (vGoster > 0.0 ? 1.0 : 0.0);',
  '}',
].join('\n');

const KUS_FRAGMENT = [
  'uniform vec3 uRenk;',
  'uniform float uOpaklik;',
  'varying float vCirpma;',
  'varying float vGolge;',
  'varying float vGoster;',
  'void main() {',
  '  if (vGoster <= 0.0) discard;',
  '  vec2 p = gl_PointCoord * 2.0 - 1.0;',
  // Martı silueti: iki kanat, çırpmayla açılan bir "V". Gövde yok — bu
  // boyutta gövde tek piksel eder ve şekli bulandırır.
  '  float w = abs(p.x);',
  '  float acik = mix(0.75, 0.12, vCirpma);',
  '  float kanat = -acik * w + acik * 0.42 * sin(w * 3.14159);',
  '  float d = abs(p.y - kanat);',
  '  float form = smoothstep(0.34, 0.04, d) * (1.0 - smoothstep(0.74, 0.99, w));',
  '  if (form <= 0.01) discard;',
  '  float a = form * uOpaklik * (vGolge > 0.5 ? 0.30 : 1.0);',
  '  gl_FragColor = vec4(uRenk, a);',
  '}',
].join('\n');

/**
 * Kuş katmanı kurar.
 *
 * Her kuş İKİ nokta olarak üretilir: biri kuşun kendisi, biri suya düşen
 * gölgesi. İkisi aynı tohumu paylaşır, yalnız ekran kayması ve opaklığı
 * ayrışır — böylece gölge kuşu birebir takip eder, ayrı bir simülasyon
 * gerekmez.
 */
export function kusKatmani(THREE, { uDist, uAlan, uDistMax, uHex, sayi = 900 }) {
  const toplam = sayi * 2;
  const konum = new Float32Array(toplam * 3);   // gerçek konum shader'da; bu yalnız yer tutar
  const tohum = new Float32Array(toplam);
  for (let i = 0; i < sayi; i++) {
    tohum[i * 2] = i + 0.1;          // kuş
    tohum[i * 2 + 1] = i + 0.9;      // gölgesi (fract(t*91.7) ayrımı)
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(konum, 3));
  geo.setAttribute('aTohum', new THREE.BufferAttribute(tohum, 1));

  const U = {
    uTime: { value: 0 },
    uHiz: { value: 1.0 },
    uYukseklik: { value: 9.0 },      // ekran pikseli cinsinden kuş-gölge mesafesi
    uPikselDunya: { value: 1.0 },    // 1 ekran pikseli kaç dünya birimi
    uBoyut: { value: 9.0 },
    uYon: { value: 0.6 },
    uSayiOran: { value: 0.55 },
    uKiyiSevgisi: { value: 0.7 },
    uRenk: { value: new THREE.Color('#0f1519') },
    uOpaklik: { value: 0.95 },
    uAlan, uDist, uDistMax, uHex,
  };

  const mesh = new THREE.Points(geo, new THREE.ShaderMaterial({
    uniforms: U,
    vertexShader: KUS_VERTEX,
    fragmentShader: KUS_FRAGMENT,
    transparent: true,
    depthWrite: false,
    depthTest: false,
  }));
  mesh.frustumCulled = false;
  return { mesh, U };
}
