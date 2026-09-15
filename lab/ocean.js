// Gerstner denizi — İKİ laboratuvarın ortak kaynağı.
//
// `sulab.html` denizi tek başına (ada, ufuk, eğik kamera) gösterir;
// `sulab-oyun.html` aynı malzemeyi OYUNUN haritasına, tepeden bakan
// ortografik kamerayla bağlar. Shader iki dosyaya kopyalanmaz: bu depoda
// "aynı oyunda iki ayrı sanat yönetimi" bir kez yaşandı (bkz.
// renderer.glWater yorumu) ve iki kopya kaçınılmaz olarak ayrışır.
//
// Dünya koordinatı nereden geldiği tek fark: adada düzlemin kendi
// koordinatı, haritada kameranın altına yerleşen yamanın origin + span'i.

/** Önayarlar. Renk çapası master'dan: TERRAIN sea paleti + water.js köpüğü. */
export const ONAYARLAR = {
  master: {
    ad: 'Master', deep: '#0a2836', ocean: '#103544', coast: '#153f4e',
    foam: '#bacccc', ufuk: '#20404e', zenit: '#0c2230', gunes: '#d8e8e6',
    sss: '#1d5560',
    amp: 1.0, chop: 0.55, foamAmt: 0.55, detay: 0.5, parilti: 0.45,
    sssG: 0.35, gunesY: 0.30, ruzgar: 35, yansima: 0.35, rampa: 1.0, kabartma: 1.0,
  },
  sot: {
    ad: 'Sea of Thieves', deep: '#06303f', ocean: '#0e5c6c', coast: '#219aa0',
    foam: '#ffffff', ufuk: '#4d8ea3', zenit: '#17506e', gunes: '#fff0cf',
    sss: '#2fb9ae',
    amp: 2.4, chop: 0.95, foamAmt: 1.0, detay: 0.35, parilti: 0.7,
    sssG: 1.15, gunesY: 0.45, ruzgar: 35, yansima: 0.55, rampa: 0.0, kabartma: 1.9,
  },
  gercek: {
    ad: 'Gerçekçi', deep: '#04202c', ocean: '#0a3646', coast: '#12586a',
    foam: '#dfeef0', ufuk: '#2b5468', zenit: '#0a1e2e', gunes: '#ffe6bd',
    sss: '#1a6b6a',
    amp: 1.5, chop: 1.0, foamAmt: 0.6, detay: 1.0, parilti: 1.0,
    sssG: 0.55, gunesY: 0.18, ruzgar: 35, yansima: 0.45, rampa: 0.35, kabartma: 1.35,
  },
};

/**
 * Yeni eklenen fiziğin ortak tabanı. Önayarlar bunun üstüne yazar; böylece
 * bir kaydıraç eklendiğinde üç önayarı da elle güncellemek gerekmez.
 */
export const TABAN = {
  hiz: 1.0, yayilma: 1.0, esinti: 0.35,
  kiyiKirilma: 0.9, kiyiMenzil: 6.0, girdap: 0.35,
  kirilma: 1.0, sogurma: 0.35, kostik: 0.5, kostikOlcek: 1.6, seviye: 5.0,
  pariltiGenis: 0.35, kopukEsik: 0.55, kopukOmur: 0.45,
  faset: 0.0, fasetOlcek: 9.0,
  // Oyunun kendi kara isigiyla ayni: surfaceGL'deki sabit yon.
  gunesAci: 231,
};

// Durgun deniz: dalga yok denecek kadar az, iş fasetlerde. Kaplama kolunda
// karşılığı zayıftır — bu önayar kırılma kolu için tasarlandı.
ONAYARLAR.durgun = {
  ad: 'Durgun', deep: '#0a2836', ocean: '#103544', coast: '#153f4e',
  foam: '#cfe0e0', ufuk: '#25505f', zenit: '#0e2836', gunes: '#e8f2ee',
  sss: '#1d5560',
  amp: 0.12, chop: 0.18, hiz: 0.35, yayilma: 0.6, esinti: 0.15,
  kiyiKirilma: 0.5, kiyiMenzil: 5, girdap: 0.15,
  kirilma: 0.5, sogurma: 0.15, kostik: 0.25, kostikOlcek: 3.2, seviye: 5,
  foamAmt: 0.12, kopukEsik: 0.9, kopukOmur: 0.2, detay: 0.12,
  parilti: 1.6, pariltiGenis: 0.08, sssG: 0.2, yansima: 0.55,
  faset: 0.75, fasetOlcek: 7.0,
  rampa: 1.0, kabartma: 0.8,
};

// KEREM — elle bulunmuş ayar, kaydırıla kaydırıla oturmuş hâli.
//
// Karakteri şu: dev ama ÇOK YAVAŞ kabarma (hız 0,07 — dalga neredeyse duruyor,
// deniz nefes alıyor gibi), sert kırılma ve yüksek soğurma (su kalın ve
// bulanık, altı ancak sığda seçiliyor), köpük yok, iş fasetlerde ve kabartmada.
// Güneş alçakta, gök yansıması kapalı: ışık suyun İÇİNDEN geliyor gibi duruyor.
//
// Sayılar tahmin değil, oyuncunun panelde bulup kopyaladığı değerler.
ONAYARLAR.kerem = {
  ad: 'Kerem',
  deep: '#0a2836', ocean: '#103544', coast: '#153f4e',
  foam: '#bacccc', ufuk: '#20404e', zenit: '#0c2230', gunes: '#d8e8e6',
  sss: '#1d5560',
  amp: 4, chop: 1.2, hiz: 0.07, ruzgar: 165, yayilma: 1, esinti: 1,
  kiyiKirilma: 0.98, kiyiMenzil: 2, girdap: 1,
  kirilma: 4, sogurma: 2, seviye: 1, kostik: 0.12, kostikOlcek: 5,
  parilti: 0.48, pariltiGenis: 0.32, yansima: 0, gunesY: 0.11, sssG: 0.1,
  faset: 2, fasetOlcek: 5.5,
  foamAmt: 0, kopukEsik: 0.36, kopukOmur: 0.28, detay: 1.5,
  kabartma: 1.9, rampa: 0,
};

// KEREM 2 — aynı karakter, gürültüsü alınmış hâli.
//
// 'kerem' önayarının tercihleri korunur (dev ve çok yavaş kabarma, alçak
// güneş, köpüksüz deniz); değişen yalnız üç ölçülebilir kusur:
//
//   1. Faset 2,0 ve 5,5 birimken deniz baştan aşağı beyaz noktayla kaplanıyor
//      ve bu su değil PARAZİT gibi okunuyordu. Faset büyütülüp zayıflatıldı:
//      artık gerçek durgun sudaki gibi seyrek ve iri.
//   2. Soğurma 2,0 + derinlik ölçeği 1 birlikte suyu iki hex ötede "en derin"
//      yapıyordu; kontrast ezilince 4,0'lık dalga görünmez oluyordu — yani
//      dalganın bedeli ödenip karşılığı alınmıyordu.
//   3. Yansıma 0 iken hiçbir yerde parlama yoktu; su boyanmış gibi duruyordu.
//      İnce bir sırt parlaması suyu SIVI yapar.
ONAYARLAR.kerem2 = {
  ad: 'Kerem 2',
  deep: '#0a2836', ocean: '#103544', coast: '#153f4e',
  foam: '#bacccc', ufuk: '#20404e', zenit: '#0c2230', gunes: '#dfe9e4',
  sss: '#1d5560',
  amp: 4, chop: 1.2, hiz: 0.07, ruzgar: 165, yayilma: 1, esinti: 1,
  kiyiKirilma: 0.98, kiyiMenzil: 5, girdap: 1,
  kirilma: 2.6, sogurma: 1.1, seviye: 3.5, kostik: 0.18, kostikOlcek: 4,
  parilti: 0.85, pariltiGenis: 0.28, yansima: 0.2, gunesY: 0.13, sssG: 0.18,
  faset: 0.8, fasetOlcek: 14,
  foamAmt: 0, kopukEsik: 0.36, kopukOmur: 0.28, detay: 0.6,
  kabartma: 1.9, rampa: 0,
};

for (const o of Object.values(ONAYARLAR)) {
  for (const [k, v] of Object.entries(TABAN)) if (o[k] === undefined) o[k] = v;
}
ONAYARLAR.sot.kiyiKirilma = 1.3;
ONAYARLAR.sot.kostik = 0.8;
ONAYARLAR.sot.pariltiGenis = 0.55;
ONAYARLAR.gercek.sogurma = 0.55;
ONAYARLAR.gercek.kirilma = 1.4;
ONAYARLAR.gercek.pariltiGenis = 0.15;

/**
 * Dalga tayfı: uzun kabarma + kısa çırpıntı. `boy` dalga boyu (dünya birimi),
 * `gen` göreli genlik, `sapma` rüzgârdan sapma (derece). Hepsi aynı yöne
 * bakarsa deniz "oluklu sac" olur; yayılma bu yüzden var.
 */
export const TAYF = [
  { boy: 118, gen: 1.00, sapma: 0 },
  { boy: 74, gen: 0.60, sapma: 22 },
  { boy: 46, gen: 0.34, sapma: -29 },
  { boy: 29, gen: 0.20, sapma: 44 },
  { boy: 19, gen: 0.12, sapma: -57 },
  { boy: 13, gen: 0.07, sapma: 71 },
];

// EN KISA DALGA NEDEN 13 BİRİM?
//
// Mesh 512 gözlü ve ekranı kaplar; bir göz ~10 dünya birimi eder. 7 birimlik
// bir dalgaya göz başına 0,7 örnek düşer — Nyquist'in çok altı. Örneklenemeyen
// dalga yok olmaz, YALANCI bir desene dönüşür ve kamera kayınca o desen
// deli gibi kaynar (kullanıcı bunu "uzak zoomda dalgalar aşırı hızlı" diye
// gördü). Geometri artık yalnız çözebildiği dalgayı taşıyor; ondan incesi
// yüzey detayına (doku, mipmap'li, takma adı yok) bırakıldı.


/** Tayfı uniform dizisine çevirir; `olcek` dalga boylarını dünyaya uyarlar. */
export function dalgaDizisi(THREE, P, olcek = 1) {
  const arr = [];
  let toplam = 0;
  for (const d of TAYF) {
    const yayilma = P.yayilma === undefined ? 1 : P.yayilma;
    const a = (P.ruzgar + d.sapma * yayilma) * Math.PI / 180;
    const gen = d.gen * P.amp * olcek;
    toplam += gen;
    arr.push(new THREE.Vector4(Math.cos(a), Math.sin(a), Math.max(gen, 1e-4), d.boy * olcek));
  }
  return { arr, toplam };
}

/**
 * Döşenebilir değer gürültüsü (fBm). Dosya yok, ağ yok: dizi burada üretilir,
 * laboratuvar da oyun gibi çevrimdışı çalışsın.
 */
export function gurultuDokusu(THREE, N = 256) {
  const rast = (x, y, tohum) => {
    let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(tohum, 1442695041);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
  };
  const yumusa = (t) => t * t * (3 - 2 * t);
  const mod = (a, b) => ((a % b) + b) % b;
  const katman = (x, y, per, tohum) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = yumusa(x - xi), yf = yumusa(y - yi);
    const v = (dx, dy) => rast(mod(xi + dx, per), mod(yi + dy, per), tohum);
    return (v(0, 0) * (1 - xf) + v(1, 0) * xf) * (1 - yf)
      + (v(0, 1) * (1 - xf) + v(1, 1) * xf) * yf;
  };
  const veri = new Uint8Array(N * N * 4);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      let s = 0, genlik = 0.5, per = 8;
      for (let o = 0; o < 5; o++) {
        s += katman(x / N * per, y / N * per, per, o + 1) * genlik;
        genlik *= 0.5; per *= 2;
      }
      const i = (y * N + x) * 4;
      const v = Math.max(0, Math.min(255, Math.round(s * 255)));
      veri[i] = veri[i + 1] = veri[i + 2] = v;
      veri[i + 3] = 255;
    }
  }
  const t = new THREE.DataTexture(veri, N, N, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.generateMipmaps = true;
  t.needsUpdate = true;
  return t;
}

/**
 * Gökyüzü. Gök kubbesi ve SUYUN YANSIMASI aynı fonksiyonu çağırır; ikisi
 * ayrılırsa denizde yansıyan gök, gerçek gökten başka bir yer olur.
 */
export const GOK_GLSL = [
  'uniform vec3 uUfuk, uZenit, uGunesCol, uGunesDir;',
  'vec3 gok(vec3 dir) {',
  '  vec3 d = normalize(dir);',
  '  vec3 c = mix(uUfuk, uZenit, pow(clamp(d.y, 0.0, 1.0), 0.55));',
  '  c = mix(uUfuk * 0.82, c, smoothstep(-0.12, 0.05, d.y));',
  '  float sd = max(dot(d, uGunesDir), 0.0);',
  '  c += uGunesCol * pow(sd, 900.0) * 2.6;',
  '  c += uGunesCol * pow(sd, 15.0) * 0.16;',
  '  return c;',
  '}',
].join('\n');

/**
 * Su vertex shader'ı.
 *
 * @param {boolean} yama  true ise düzlem BİRİM karedir ve dünya koordinatı
 *   `uOrigin + position.xz * uSpan` ile kurulur (kameranın altına yerleşen
 *   yama). false ise düzlemin kendi koordinatı dünya koordinatıdır.
 */
export function suVertex({ yama = false } = {}) {
  const dunya = yama
    ? '  vec2 dp = uOrigin + position.xz * uSpan;'
    : '  vec2 dp = position.xz;';

  // KIYI KIRILMASI — alan yaması.
  //
  // Dalganın yönünü konuma bağlı yapmak fazı YIRTAR: faz k·(d·p) biçimindedir,
  // d konuma bağlıysa faz artık konumun düzgün bir fonksiyonu değildir; komşu
  // noktalar farklı faz görür, tepe kırılır, analitik normal patlar. Onun
  // yerine KONUM yamultulur — faz hâlâ tek bir sürekli skaler alandır, ama
  // cepheler kıyı konturlarına yaslanır: adalar sarılır, körfezler yelpaze
  // açar, burunlar odaklanır. Yamanın yönü kıyı gradyanı, şiddeti sığlıktır.
  // NOT: vertex shader'da texture2DLod DEĞİL texture2D kullanılır — three.js
  // GLSL1 kaynağını WebGL2 için GLSL3'e çeviriyor ve texture2DLod o çeviride
  // karşılıksız kalıyor (ölçüldü: 'no matching overloaded function').
  const kiyi = yama ? [
    '  vec2 kauv = (dp - uAlan.xy) / uAlan.zw;',
    '  float e = 2.0 / 512.0;',
    '  float dL = texture2D(uDist, kauv - vec2(e, 0.0)).r;',
    '  float dR = texture2D(uDist, kauv + vec2(e, 0.0)).r;',
    '  float dD = texture2D(uDist, kauv - vec2(0.0, e)).r;',
    '  float dU = texture2D(uDist, kauv + vec2(0.0, e)).r;',
    '  float dM = texture2D(uDist, kauv).r * uDistMax;',
    '  vec2 grad = vec2(dR - dL, dU - dD);',
    '  float gUz = length(grad);',
    '  float sig = 1.0 - smoothstep(0.0, uHex * uKiyiMenzil, dM);',
    '  if (gUz > 1e-5) dp += (grad / gUz) * sig * sig * uKiyiKirilma * uHex;',
    // Girdaplar: açık denizde yönü yavaşça döndüren geniş ölçekli yama. Kıyı
    // yamasıyla aynı mantık, farklı ölçek — deniz her yerde aynı yöne gitmesin.
    '  float g1 = texture2D(uGurultu, dp / 2600.0).r - 0.5;',
    '  float g2 = texture2D(uGurultu, dp.yx / 3100.0 + 0.37).r - 0.5;',
    '  dp += vec2(g1, g2) * uGirdap * uHex * 6.0;',
  ].join('\n') : '';

  // Esinti: genlik yerel olarak modülasyona uğrar. Genlik FAZIN içinde
  // olmadığı için bunu uzamsal yapmak yırtılma üretmez — hamleler serbest.
  // KASIRGA. Merkeze yaklaştıkça dalga azar, ama tam ortada GÖZ vardır ve
  // orası sakindir — bunu atlarsan fırtına yalnız bir daire lekesi olur.
  // Yön de değişir: teğetsel bir yama dalgayı sarmala oturtur. Yönü değil
  // konumu bükmek burada da kural (bkz. kıyı kırılması) — faz sürekliliği
  // fırtınanın içinde de bozulmamalı.
  const kasirga = yama ? [
    '  float ks = 0.0;',
    '  if (uKasirga.w > 0.001) {',
    '    vec2 kv = dp - uKasirga.xy;',
    '    float kd = length(kv);',
    '    ks = uKasirga.w * (1.0 - smoothstep(uKasirga.z * 0.12, uKasirga.z, kd));',
    '    ks *= smoothstep(0.0, uKasirga.z * 0.16, kd);',
    '    vec2 teg = vec2(-kv.y, kv.x) / max(kd, 1.0);',
    '    dp += teg * ks * uHex * 6.0;',
    '  }',
    '  vKasirga = ks;',
  ].join('\n') : '  vKasirga = 0.0;';

  const esinti = yama
    ? [
      '  float esintiN = texture2D(uGurultu, dp / 4200.0 + uTime * 0.0015).r;',
      '  float esintiK = mix(1.0 - uEsinti, 1.0 + uEsinti, esintiN) * (1.0 + ks * 2.4);',
    ].join('\n')
    : '  float esintiK = 1.0;';

  return [
    'uniform float uTime, uChop, uHiz;',
    'uniform vec4 uDalga[6];',
    yama ? 'uniform vec2 uOrigin, uSpan;' : '',
    yama ? 'uniform vec4 uAlan; uniform sampler2D uDist; uniform sampler2D uGurultu;' : '',
    yama ? 'uniform float uDistMax, uHex, uKiyiKirilma, uKiyiMenzil, uGirdap, uEsinti;' : '',
    yama ? 'uniform vec4 uKasirga;' : '',
    'varying vec3 vDunya; varying vec3 vNrm; varying float vKopuk; varying float vYuk;',
    'varying float vSig; varying float vKasirga;',
    'void main() {',
    dunya,
    '  vec2 hamDp = dp;',
    kiyi,
    kasirga,
    esinti,
    '  vec3 kay = vec3(0.0);',
    '  vec3 ddx = vec3(1.0, 0.0, 0.0);',
    '  vec3 ddz = vec3(0.0, 0.0, 1.0);',
    '  for (int i = 0; i < 6; i++) {',
    '    vec2 d = normalize(uDalga[i].xy);',
    '    float A = uDalga[i].z * esintiK;',
    '    float w = 6.2831853 / uDalga[i].w;',
    // Derin su dağılımı: uzun dalga hızlı gider. Hepsi aynı hızda giderse
    // desen donar ve deniz "kayan duvar kâğıdı" olur.
    '    float hiz = sqrt(9.81 / w) * 0.55 * uHiz;',
    '    float ph = w * dot(d, dp) + uTime * hiz;',
    '    float Q = uChop / (w * A * 6.0 + 1e-5);',
    '    float c = cos(ph), s = sin(ph);',
    '    kay.x += Q * A * d.x * c;',
    '    kay.z += Q * A * d.y * c;',
    '    kay.y += A * s;',
    '    float wa = w * A;',
    '    ddx.x += -Q * wa * d.x * d.x * s;',
    '    ddx.y +=  wa * d.x * c;',
    '    ddx.z += -Q * wa * d.x * d.y * s;',
    '    ddz.x += -Q * wa * d.y * d.x * s;',
    '    ddz.y +=  wa * d.y * c;',
    '    ddz.z += -Q * wa * d.y * d.y * s;',
    '  }',
    // Yer değiştirme HAM konuma biner: yama yalnızca fazı taşır, geometrinin
    // duracağı yeri değil. Yamultulmuş konuma binerse bütün deniz kıyıdan kayar.
    '  vec3 pos = vec3(hamDp.x, 0.0, hamDp.y) + kay;',
    '  vNrm = normalize(cross(ddz, ddx));',
    // Jacobian: yatay sıkışma. Tepe kırılırken alan daralır ve köpük ORADA
    // olur; "yüksek yer köpüklüdür" kestirmesi tepeyi boydan boya beyaza
    // boyuyordu.
    '  float J = ddx.x * ddz.z - ddx.z * ddz.x;',
    '  vKopuk = clamp(1.0 - J, 0.0, 2.0);',
    '  vYuk = kay.y;',
    yama ? '  vSig = sig;' : '  vSig = 0.0;',
    '  vDunya = pos;',
    '  gl_Position = projectionMatrix * viewMatrix * vec4(pos, 1.0);',
    '}',
  ].filter(Boolean).join('\n');
}

/**
 * Su fragment shader'ı.
 *
 * @param {boolean} maske  true ise sığlık ve ALFA oyunun kıyı-uzaklığı
 *   alanından (`material.cache.toLand`) okunur: kara olan yerde su çizilmez,
 *   kıyıda yumuşak biter. false ise ada laboratuvarının halka sığlığı.
 */
export function suFragment({ maske = false } = {}) {
  const derinlik = maske
    ? [
      // Dünya -> alan uv. Doğu-batı sarmalı için x REPEAT.
      '  vec2 auv = vec2((vDunya.x - uAlan.x) / uAlan.z, (vDunya.z - uAlan.y) / uAlan.w);',
      '  float toLand = texture2D(uDist, auv).r * uDistMax;',
      '  float derinlik = clamp(toLand / (uHex * 5.0), 0.0, 1.0);',
      // Kıyıda alfa: kara hexin üstüne su taşmasın, ama kenar da testere olmasın.
      '  float alfa = smoothstep(0.0, uHex * 0.34, toLand);',
    ].join('\n')
    : [
      '  float derinlik = clamp((length(vDunya.xz) - uKiyiR) / 95.0, 0.0, 1.0);',
      '  float alfa = 1.0;',
    ].join('\n');

  // OYUNUN KENDİ DENİZ RAMPASI (material.stageSea ile aynı sayılar).
  //
  // Üç renk karıştırmak paleti YAKLAŞIK tutuyordu; oysa haritanın deniz rengi
  // zaten bir fonksiyon: kıyı uzaklığı iki frekansta bozulur, şelf ile abis
  // arasında ton/doygunluk/parlaklık kayar, dar bir bantta kırık köpük parlar.
  // Aynı formül burada da kurulur — böylece 3B su master'ın rengine benzemez,
  // AYNI rengi üretir; dalga, ışık ve köpük onun ÜSTÜNE biner.
  const rampa = maske ? [
    '  float nBroad = nz(vDunya.xz / 404.0);',
    '  float nFine  = nz(vDunya.xz / 85.0);',
    '  float nFoam  = nz(vDunya.xz / 22.0);',
    '  float nMood  = nz(vDunya.xz / 1530.0);',
    '  float dw = toLand + (nBroad - 0.5) * uHex * 1.25 + (nFine - 0.5) * uHex * 1.05;',
    '  float shelf = 1.0 - smoothstep(uHex * 0.15, uHex * 0.95, dw);',
    '  float abis = smoothstep(uHex * 0.76, uHex * 4.0, dw);',
    '  float hue = 191.0 + abis * 10.0 - shelf * 2.0;',
    '  float sat = 21.0 + abis * 11.0 + shelf * 2.0;',
    '  float light = 10.5 + shelf * 7.5 - abis * 2.2 + (nMood - 0.5) * 2.0;',
    '  float band = shelf * (1.0 - smoothstep(uHex * 0.45, uHex * 1.0, dw));',
    '  float kirik = band * max(0.0, nFoam - 0.62) * 2.6;',
    '  light += kirik * 9.0;',
    '  vec3 rampaCol = hsl2rgb(hue / 360.0, clamp(sat + kirik * 8.0, 0.0, 60.0) / 100.0,',
    '                          clamp(light, 3.0, 34.0) / 100.0);',
    '  govde = mix(govde, rampaCol, uRampa);',
  ].join('\n') : '';

  return GOK_GLSL + '\n' + [
    'uniform vec3 uDerin, uOkyanus, uKiyi, uKopukCol, uSSSCol, uKamera;',
    'uniform float uTime, uKopukMik, uSSS, uParilti, uDetay, uTepeMax, uYansima;',
    maske ? 'uniform vec4 uAlan; uniform sampler2D uDist; uniform float uDistMax, uHex;'
      : 'uniform float uKiyiR;',
    maske ? 'uniform float uRampa;' : '',
    'uniform sampler2D uGurultu;',
    'varying vec3 vDunya; varying vec3 vNrm; varying float vKopuk; varying float vYuk;',
    'varying float vSig; varying float vKasirga;',
    'float nz(vec2 p) { return texture2D(uGurultu, p).r; }',
    // material.js HSL ile düşünür (seaShade/stageSea); rampayı oraya sadık
    // tutmak için dönüşüm burada yapılır, sayılar orada kalır.
    'vec3 hsl2rgb(float h, float s, float l) {',
    '  vec3 k = mod(vec3(0.0, 8.0, 4.0) + h * 12.0, 12.0);',
    '  float a = s * min(l, 1.0 - l);',
    '  return l - a * clamp(min(k - 3.0, 9.0 - k), -1.0, 1.0);',
    '}',
    // Yükseklikten normal: merkezî fark. dFdx yerine doku örneği — ölçek
    // elimizde kalsın.
    'vec2 detayEgim(vec2 p, float olcek, float kay) {',
    '  vec2 uv = p * olcek + vec2(kay * 0.013, kay * 0.0091);',
    '  float e = 1.0 / 256.0;',
    '  float hL = nz(uv - vec2(e, 0.0)), hR = nz(uv + vec2(e, 0.0));',
    '  float hD = nz(uv - vec2(0.0, e)), hU = nz(uv + vec2(0.0, e));',
    '  return vec2(hL - hR, hD - hU);',
    '}',
    'void main() {',
    '  vec3 V = normalize(uKamera - vDunya);',
    '  vec3 N = normalize(vNrm);',
    '  vec2 e1 = detayEgim(vDunya.xz, 0.055, uTime);',
    '  vec2 e2 = detayEgim(vDunya.xz, 0.17, -uTime * 1.6);',
    '  N = normalize(N + vec3(e1.x + e2.x * 0.55, 0.0, e1.y + e2.y * 0.55) * uDetay * 7.0);',
    derinlik,
    '  vec3 govde = mix(uKiyi, uOkyanus, smoothstep(0.0, 0.5, derinlik));',
    '  govde = mix(govde, uDerin, smoothstep(0.42, 1.0, derinlik));',
    rampa,
    // Fresnel. Tepeden bakan ortografik kamerada bu terim neredeyse sıfırdır
    // (dik bakış), o yüzden uYansima ile bir taban eklenir: harita denizi
    // fizikte değil, okunurlukta haklı çıkmalı.
    '  float fres = 0.02 + 0.98 * pow(1.0 - max(dot(N, V), 0.0), 5.0);',
    '  fres = clamp(fres + uYansima * 0.25, 0.0, 1.0);',
    '  vec3 yansima = gok(reflect(-V, N));',
    // Altyüzey saçılımı: ince tepe güneşe karşı içten aydınlanır. Suyu
    // "boyalı cam" olmaktan çıkaran terim budur.
    '  float tepe = smoothstep(0.15, 0.95, vYuk / max(0.001, uTepeMax));',
    '  float arka = pow(max(dot(V, -uGunesDir), 0.0), 3.0);',
    '  vec3 sss = uSSSCol * tepe * (0.30 + arka * 0.9) * uSSS;',
    '  vec3 H = normalize(V + uGunesDir);',
    '  float ndh = max(dot(N, H), 0.0);',
    '  float spek = pow(ndh, 300.0) * 1.7 + pow(ndh, 34.0) * 0.10;',
    '  vec3 col = mix(govde + sss, yansima, fres);',
    '  col += uGunesCol * spek * uParilti;',
    '  float gn = nz(dip * 0.045 + vec2(uTime * 0.011, uTime * 0.008));',
    '  float tepeKopuk = smoothstep(0.50, 1.10, vKopuk * (0.60 + gn * 0.8));',
    '  float kiyiKopuk = (1.0 - smoothstep(0.0, 0.12, derinlik))',
    '    * (0.30 + 0.70 * nz(vDunya.xz * 0.085 - vec2(uTime * 0.02, 0.0)));',
    '  float kopuk = clamp(max(tepeKopuk, kiyiKopuk) * uKopukMik, 0.0, 1.0);',
    '  col = mix(col, uKopukCol, kopuk);',
    maske ? '' : '  col = mix(col, uUfuk, smoothstep(300.0, 620.0, length(uKamera - vDunya)));',
    '  gl_FragColor = vec4(col, alfa);',
    '}',
  ].filter(Boolean).join('\n');
}

/**
 * KAPLAMA fragment'i — haritanın kendi denizinin ÜSTÜNE binen kabartma.
 *
 * Neden boyama değil kaplama: haritanın deniz rengi bir formül değil, bir
 * BİRİKİM — kıyı-uzaklığı rasteri, iki frekanslı bozulma, ruh hâli gürültüsü,
 * kırık köpük bandı ve kıyı geçişleri üst üste biner (material.stageSea,
 * water.drawCoastline). Bunu shader'da yeniden kurmak paleti kaçırdı
 * (ölçüldü: deniz belirgin biçimde koyulaştı, kıyı halesi kayboldu). Kaplama
 * o soruyu ortadan kaldırır: renk ZATEN altta duruyor, buraya yalnız dalganın
 * ışığı, köpüğü ve parıltısı eklenir.
 *
 * İki geçiş, iki karışım:
 *   'carpim' → dst * src   : dalganın gölge yüzü karartır
 *   'ekle'   → dst + src   : tepe, köpük, güneş parıltısı aydınlatır
 * Tek geçişle ikisi birden yapılamaz; çarpım aydınlatamaz, ekleme karartamaz.
 */
export function kaplamaFragment({ gecis = 'carpim' } = {}) {
  const carpim = gecis === 'carpim';
  return GOK_GLSL + '\n' + [
    'uniform vec3 uKopukCol, uSSSCol, uKamera;',
    'uniform float uTime, uKopukMik, uSSS, uParilti, uDetay, uTepeMax, uKabartma;',
    'uniform vec4 uAlan; uniform sampler2D uDist; uniform float uDistMax, uHex;',
    'uniform sampler2D uGurultu;',
    'varying vec3 vDunya; varying vec3 vNrm; varying float vKopuk; varying float vYuk;',
    'float nz(vec2 p) { return texture2D(uGurultu, p).r; }',
    'vec2 detayEgim(vec2 p, float olcek, float kay) {',
    '  vec2 uv = p * olcek + vec2(kay * 0.013, kay * 0.0091);',
    '  float e = 1.0 / 256.0;',
    '  float hL = nz(uv - vec2(e, 0.0)), hR = nz(uv + vec2(e, 0.0));',
    '  float hD = nz(uv - vec2(0.0, e)), hU = nz(uv + vec2(0.0, e));',
    '  return vec2(hL - hR, hD - hU);',
    '}',
    'void main() {',
    '  vec2 auv = vec2((vDunya.x - uAlan.x) / uAlan.z, (vDunya.z - uAlan.y) / uAlan.w);',
    '  float toLand = texture2D(uDist, auv).r * uDistMax;',
    // Kıyıda söner: haritanın kıyı halesi ve sığlık geçişi dalganın altında
    // kalmasın, karanın üstüne de hiç taşmasın.
    '  float alfa = smoothstep(0.0, uHex * 0.55, toLand);',
    '  vec3 V = normalize(uKamera - vDunya);',
    '  vec3 N = normalize(vNrm);',
    '  vec2 e1 = detayEgim(vDunya.xz, 0.055, uTime);',
    '  vec2 e2 = detayEgim(vDunya.xz, 0.17, -uTime * 1.6);',
    '  N = normalize(N + vec3(e1.x + e2.x * 0.55, 0.0, e1.y + e2.y * 0.55) * uDetay * 7.0);',
    // Hillshade: düz suyun aldığı ışık taban kabul edilir, kabartma yalnız
    // FARKI taşır. Böylece denizin ortalama parlaklığı değişmez, yalnız
    // dalganın yüzleri ayrışır.
    '  float l0 = max(dot(vec3(0.0, 1.0, 0.0), uGunesDir), 0.0);',
    '  float l = max(dot(N, uGunesDir), 0.0);',
    '  float fark = (l - l0) * uKabartma;',
    carpim
      ? [
        '  float koyu = 1.0 + min(fark, 0.0) * 1.6;',
        '  gl_FragColor = vec4(mix(vec3(1.0), vec3(clamp(koyu, 0.35, 1.0)), alfa), 1.0);',
      ].join('\n')
      : [
        '  vec3 H = normalize(V + uGunesDir);',
        '  float ndh = max(dot(N, H), 0.0);',
        '  float spek = pow(ndh, 300.0) * 1.7 + pow(ndh, 34.0) * 0.10;',
        '  float tepe = smoothstep(0.15, 0.95, vYuk / max(0.001, uTepeMax));',
        '  float arka = pow(max(dot(V, -uGunesDir), 0.0), 3.0);',
        '  float gn = nz(dip * 0.045 + vec2(uTime * 0.011, uTime * 0.008));',
        // Köpük yalnız tepe KIRILIRKEN: Jacobian sıkışması. Yükseklik eşiği
        // tepeyi boydan boya beyaza boyuyordu.
        '  float kopuk = smoothstep(0.55, 1.15, vKopuk * (0.60 + gn * 0.8)) * uKopukMik;',
        '  vec3 ek = vec3(0.0);',
        '  ek += max(fark, 0.0) * 0.55 * vec3(0.72, 0.86, 0.92);',
        '  ek += uGunesCol * spek * uParilti * 0.5;',
        '  ek += uSSSCol * tepe * (0.10 + arka * 0.45) * uSSS;',
        '  ek += uKopukCol * kopuk * 0.75;',
        '  gl_FragColor = vec4(ek * alfa, 1.0);',
      ].join('\n'),
    '}',
  ].join('\n');
}

/**
 * KIRILMA fragment'i — suyun ALTINI gösteren kol.
 *
 * Buradaki fikir kaplamadan bir adım öte: haritanın kendi karesi bir dokuya
 * alınır (`uArka`) ve su, o dokuyu dalga normaliyle BÜKEREK örnekler. Yani
 * deniz tabanı diye ayrı bir şey çizilmez — taban zaten oyunun kendi denizi
 * ve kıyısıdır, su onun üstünde duran saydam bir katmandır.
 *
 * Palet sorusu böylece bir daha sorulmaz: renk oyunun pikselinden gelir.
 * Buraya eklenen her şey suyun FİZİĞİdir — kırılma, soğurma, kostik, köpük,
 * yansıma, parıltı.
 *
 * Ekran uzayı örneklemesinin bir bedeli var: kırılan örnek karaya taşabilir
 * ve kıyıya deniz rengi bulaşır. Bu yüzden örneğin düştüğü DÜNYA noktası
 * kıyı alanından tekrar sorulur; karaya düşüyorsa kırılma geri alınır.
 */
export function kirilmaFragment() {
  return [
    'uniform sampler2D uArka;',      // oyunun harita karesi, ekran uzayında
    'uniform sampler2D uDist;',      // karaya uzaklık alanı
    'uniform sampler2D uGurultu;',
    'uniform vec2 uCozunurluk;',     // tuval pikseli
    'uniform vec2 uEkranSpan;',      // ekranın kapladığı DÜNYA en/boyu
    'uniform vec4 uAlan;',
    'uniform vec3 uGunesDir, uGunesCol, uKopukCol, uSSSCol, uKamera, uUfuk, uZenit;',
    'uniform float uTime, uDistMax, uHex, uSeviye;',
    'uniform float uKirilma, uSogurma, uKostik, uKostikOlcek;',
    'uniform float uKopukMik, uKopukEsik, uKopukOmur;',
    'uniform float uParilti, uPariltiGenis, uSSS, uDetay, uYansima;',
    'uniform float uFaset, uFasetOlcek;',
    'uniform float uOlcek;',
    'varying vec3 vDunya; varying vec3 vNrm; varying float vKopuk; varying float vYuk;',
    'varying float vSig; varying float vKasirga;',
    'uniform vec4 uKasirga;',
    '',
    'float nz(vec2 p) { return texture2D(uGurultu, p).r; }',
    '',
    // material.js HSL ile düşünür (stageSea); güvenlik ağı ona sadık kalsın.
    'vec3 hsl2rgb(float h, float s, float l) {',
    '  vec3 k = mod(vec3(0.0, 8.0, 4.0) + h * 12.0, 12.0);',
    '  float a = s * min(l, 1.0 - l);',
    '  return l - a * clamp(min(k - 3.0, 9.0 - k), -1.0, 1.0);',
    '}',
    '',
    // GÜVENLİK AĞI. Arka doku bir kare boş dönerse (tarayıcı çizim tamponunu
    // temizlemişse) deniz simsiyah kalıyordu — kullanıcı bunu "su durmadan
    // bugluyor" diye gördü. Bu fonksiyon oyunun KENDİ deniz rampasını
    // (material.stageSea sayıları) yeniden kurar: kusursuz eş değil ama
    // siyahtan sonsuz iyi, ve boşluk göze çarpmaz.
    'vec3 yedekDeniz(float toLand, vec2 dunya, float nMood) {',
    '  float shelf = 1.0 - smoothstep(uHex * 0.15, uHex * 0.95, toLand);',
    '  float abis = smoothstep(uHex * 0.76, uHex * 4.0, toLand);',
    '  float hue = 191.0 + abis * 10.0 - shelf * 2.0;',
    '  float sat = 21.0 + abis * 11.0 + shelf * 2.0;',
    '  float light = 10.5 + shelf * 7.5 - abis * 2.2 + (nMood - 0.5) * 2.0;',
    '  return hsl2rgb(hue / 360.0, sat / 100.0, clamp(light, 3.0, 34.0) / 100.0);',
    '}',
    '',
    'float kiyiUzakligi(vec2 dunya) {',
    '  return texture2D(uDist, (dunya - uAlan.xy) / uAlan.zw).r * uDistMax;',
    '}',
    '',
    // Yükseklikten normal: merkezî fark. dFdx yerine doku örneği — ölçek
    // elimizde kalsın, uzantıya da bağımlı olmayalım.
    'vec2 detayEgim(vec2 p, float olcek, float kay) {',
    '  vec2 uv = p * olcek + vec2(kay * 0.013, kay * 0.0091);',
    '  float e = 1.0 / 256.0;',
    '  float hL = nz(uv - vec2(e, 0.0)), hR = nz(uv + vec2(e, 0.0));',
    '  float hD = nz(uv - vec2(0.0, e)), hU = nz(uv + vec2(0.0, e));',
    '  return vec2(hL - hR, hD - hU);',
    '}',
    '',
    'vec3 gok(vec3 dir) {',
    '  vec3 d = normalize(dir);',
    '  vec3 c = mix(uUfuk, uZenit, pow(clamp(d.y, 0.0, 1.0), 0.55));',
    '  c = mix(uUfuk * 0.82, c, smoothstep(-0.12, 0.05, d.y));',
    '  float sd = max(dot(d, uGunesDir), 0.0);',
    '  c += uGunesCol * pow(sd, 900.0) * 2.6;',
    '  c += uGunesCol * pow(sd, 15.0) * 0.16;',
    '  return c;',
    '}',
    '',
    'void main() {',
    '  vec2 suv = gl_FragCoord.xy / uCozunurluk;',
    '  float toLand = kiyiUzakligi(vDunya.xz);',
    // Kıyıda alfa: su karanın üstüne taşmasın, kenar da testere olmasın.
    '  float alfa = smoothstep(0.0, uHex * 0.30, toLand);',
    '  if (alfa <= 0.001) discard;',
    '  float derinlik = clamp(toLand / (uHex * uSeviye), 0.0, 1.0);',
    '',
    '  vec3 V = normalize(uKamera - vDunya);',
    '  vec3 N = normalize(vNrm);',
    // Detay frekansı EKRANDA sabit tutulur: dünya biriminde sabit tutulunca
    // uzak zoomda piksel altına iniyor ve kaynıyordu. uOlcek zoom'la büyüyen
    // dalga ölçeğidir; konumu ona bölmek deseni ekrana çiviler.
    '  vec2 dip = vDunya.xz / max(1.0, uOlcek);',
    '  vec2 e1 = detayEgim(dip, 0.055, uTime);',
    '  vec2 e2 = detayEgim(dip, 0.17, -uTime * 1.6);',
    '  N = normalize(N + vec3(e1.x + e2.x * 0.55, 0.0, e1.y + e2.y * 0.55) * uDetay * 7.0);',
    '',
    // FASETLER — durgun suyun minik üçgenleri.
    //
    // Dalga dinince yüzey düzleşir ve ışık tek bir aynadan yansır: deniz ölü
    // görünür. Gerçek durgun suda yüzey binlerce küçük DÜZ yüze bölünür ve
    // her biri güneşi ayrı açıyla yakalar. Burada eşkenar üçgen ızgarası
    // kurulur, her üçgene SABİT bir eğim verilir (hücre içinde gradyan yok —
    // faset düz olmalı, yoksa gene yumuşak dalgaya döner) ve parıltı o
    // üçgenlerde tek tek çakar.
    '  if (uFaset > 0.001) {',
    '    vec2 tp = dip / max(0.5, uFasetOlcek);',
    '    vec2 eks = vec2(tp.x - tp.y * 0.57735, tp.y * 1.15470);',
    '    vec2 tab = floor(eks);',
    '    vec2 kes = fract(eks);',
    '    float ust = step(1.0, kes.x + kes.y);',
    '    vec2 hucre = tab + ust * 0.5;',
    '    vec2 fegim = vec2(nz(hucre * 0.0137 + 0.11), nz(hucre * 0.0231 + 0.67)) - 0.5;',
    '    N = normalize(N + vec3(fegim.x, 0.0, fegim.y) * uFaset * 1.6);',
    '  }',
    '',
    // KIRILMA. Snell'in tam çözümü tepeden bakışta neredeyse görünmez; asıl
    // okunur olan, normalin YATAY bileşeninin tabanı kaydırmasıdır. Kayma
    // derinlikle büyür: sığ suda taban yüzeye yakın olduğu için az sapar.
    '  vec2 dunyaKayma = vec2(N.x, N.z) * uKirilma * uHex * mix(0.05, 0.55, derinlik);',
    '  vec2 ornekDunya = vDunya.xz + dunyaKayma;',
    // Kırılan örnek karaya düşüyorsa geri al: yoksa kıyıya deniz bulaşır ve
    // kara kenarları su altında titrer.
    '  float ornekKiyi = kiyiUzakligi(ornekDunya);',
    '  float guven = smoothstep(0.0, uHex * 0.35, ornekKiyi);',
    '  vec2 uvKayma = (dunyaKayma / uEkranSpan) * guven;',
    '  vec3 taban = texture2D(uArka, suv + uvKayma).rgb;',
    '  float luma = dot(taban, vec3(0.299, 0.587, 0.114));',
    '  if (luma < 0.015) taban = yedekDeniz(toLand, vDunya.xz, nz(vDunya.xz / 1530.0));',
    '',
    // SOĞURMA (Beer-Lambert). Su kırmızıyı önce yutar, maviyi en son: bu
    // yüzden derinleşen su yeşile ve laciverte kayar. Katsayılar fiziksel
    // orandan alınır ama şiddeti kaydıraç tutar — haritanın kendi derinlik
    // rampası zaten bir kez koyulaştırıyor, üstüne binen ikinci koyulaşma
    // denizi kömüre çevirir.
    '  vec3 sonum = exp(-uSogurma * derinlik * vec3(1.35, 0.42, 0.22));',
    '  taban *= sonum;',
    '',
    // KOSTİK: dalganın odakladığı ışığın tabana düşen ağı. Yüzeye yapışık
    // değildir, tabana düşer — bu yüzden dalgadan bağımsız ve daha yavaş
    // kayar, ve yalnız sığ bantta görünür (derinde ışık zaten tabana ulaşmaz).
    '  vec2 kp = dip / (uHex * uKostikOlcek);',
    '  float k1 = nz(kp + vec2(uTime * 0.021, uTime * 0.013));',
    '  float k2 = nz(kp * 1.63 + vec2(-uTime * 0.017, uTime * 0.024));',
    '  float ag = pow(max(0.0, 1.0 - abs(k1 - k2) * 7.0), 3.0);',
    '  float kostik = ag * uKostik * (1.0 - smoothstep(0.15, 0.85, derinlik));',
    '  taban += uGunesCol * kostik * 0.55;',
    '',
    // YANSIMA. Tepeden bakışta Fresnel neredeyse hep tabanda kalır (0.02);
    // dalga sivrildikçe gerçekten artar ama gözle görülür olması için bir
    // taban eklenir. Harita denizi fizikte değil OKUNURLUKTA haklı çıkmalı.
    '  float fres = 0.02 + 0.98 * pow(1.0 - max(dot(N, V), 0.0), 5.0);',
    '  fres = clamp(fres * (1.0 + uYansima * 2.0) + uYansima * 0.06, 0.0, 1.0);',
    '  vec3 yansima = gok(reflect(-V, N));',
    '',
    // ALTYÜZEY SAÇILIMI: ince tepe güneşe karşı içten aydınlanır. Suyu
    // "boyalı cam" olmaktan çıkaran terim budur.
    '  float tepe = smoothstep(0.1, 0.9, vYuk / max(0.001, uHex * 0.12));',
    '  float arka = pow(max(dot(V, -uGunesDir), 0.0), 3.0);',
    '  vec3 sss = uSSSCol * tepe * (0.25 + arka * 0.85) * uSSS;',
    '',
    // PARILTI: tek keskin spekülar yerine genişliği ayarlanabilir bir kıvılcım
    // alanı. Dar uçta yıldız gibi tekil, geniş uçta güneş yolu gibi yayılır.
    '  vec3 H = normalize(V + uGunesDir);',
    '  float ndh = max(dot(N, H), 0.0);',
    '  float sertlik = mix(700.0, 24.0, clamp(uPariltiGenis, 0.0, 1.0));',
    '  float spek = pow(ndh, sertlik) * (0.6 + uPariltiGenis * 1.4);',
    '',
    '  vec3 col = mix(taban + sss, yansima, fres);',
    '  col += uGunesCol * spek * uParilti;',
    '',
    // KÖPÜK. Tepe KIRILIRKEN oluşur (Jacobian sıkışması), yükseklikte değil.
    // Ömür kaydıracı eşiğin eteğini genişletir: köpük tepe geçtikten sonra
    // birden kaybolmaz, arkasında bir iz bırakır (FBO'suz yaklaşım).
    '  float gn = nz(dip * 0.045 + vec2(uTime * 0.011, uTime * 0.008));',
    '  float etek = mix(0.05, 0.75, uKopukOmur);',
    '  float tepeKopuk = smoothstep(uKopukEsik, uKopukEsik + etek, vKopuk * (0.6 + gn * 0.8));',
    // Kıyı kabarması: köpük bandı sabit halka değil, dalga faziyle nefes alır.
    '  float nabiz = 0.5 + 0.5 * sin(uTime * 1.1 + toLand / (uHex * 0.7));',
    '  float kiyiKopuk = vSig * vSig * (0.35 + 0.65 * nabiz)',
    '    * (0.3 + 0.7 * nz(dip * 0.085 - vec2(uTime * 0.02, 0.0)));',
    '  float kopuk = clamp(max(tepeKopuk, kiyiKopuk) * uKopukMik, 0.0, 1.0);',
    '  col = mix(col, uKopukCol, kopuk);',
    '',
    // KASIRGA ÖRTÜSÜ.
    //
    // İlk sürüm karartmayı YALNIZ sarmal bantların içine koyuyordu ve bantlar
    // gürültü eşiğini nadiren aşıyordu: kasırga gücü 0,9'ken bile ekranda
    // hiçbir fark ölçülmedi (piksel piksel karşılaştırıldı, fark tam sıfırdı).
    // İki şey değişti: (1) fırtına artık her yeri karartıyor, bant onun
    // üstüne biniyor; (2) sarmal gürültüden değil GERÇEK bir sarmaldan
    // geliyor — açı ve yarıçap birlikte döndüğü için kollar eğriliyor.
    '  if (vKasirga > 0.002) {',
    '    vec2 kv = vDunya.xz - uKasirga.xy;',
    '    float rd = length(kv) / max(1.0, uKasirga.z);',
    '    float aci = atan(kv.y, kv.x);',
    '    float kolSayisi = 3.0;',
    '    float kolDeger = 0.5 + 0.5 * sin(aci * kolSayisi + rd * 11.0 - uTime * 0.85);',
    '    float bulut = nz(dip * 0.018 + vec2(uTime * 0.02, -uTime * 0.014));',
    '    float bant = smoothstep(0.30, 0.92, kolDeger * (0.5 + bulut * 1.0)) * vKasirga;',
    // Taban karartma: fırtınanın altında hava kararır, bant onun üstüne biner.
    '    col *= mix(1.0, 0.70, vKasirga * 0.85);',
    '    col = mix(col, vec3(0.155, 0.185, 0.215), bant * 0.60);',
    // Göz duvarı: sakin gözün kenarında köpük halkası. Fırtınayı "leke"
    // olmaktan çıkaran ayrıntı bu.
    '    float goz = 1.0 - smoothstep(0.06, 0.17, rd);',
    '    float gozDuvar = smoothstep(0.11, 0.17, rd) * (1.0 - smoothstep(0.17, 0.25, rd));',
    '    col = mix(col, uKopukCol, gozDuvar * uKasirga.w * 0.35);',
    '    col *= mix(1.0, 1.35, goz * uKasirga.w);',
    // Yağmur: hızlı, ince, yalnız fırtınanın içinde.
    '    float yagmur = nz(dip * 0.42 + vec2(uTime * 2.1, uTime * 3.3));',
    '    col += vec3(0.45, 0.55, 0.62) * smoothstep(0.90, 1.0, yagmur) * vKasirga * 0.45;',
    '  }',
    '',
    '',
    '  gl_FragColor = vec4(col, alfa);',
    '}',
  ].join('\n');
}

/**
 * Güneş yönü: yükseklik [0..1] ve azimut.
 *
 * TEK GÜNEŞ. Azimut önce `P.gunesAci` alanına bakar; yoksa rüzgâra bağlanır
 * (eski davranış). Ayrı bir alan olması şart, çünkü oyunun KENDİ kara ışığı
 * sabittir — surfaceGL içinde normalize(vec3(-0.55, -0.68, 0.48)) yazar, bu
 * da bizim eksende yükseklik 0,48 ve azimut 231 derecedir. Güneşi rüzgâra
 * bağlı bırakırsak rüzgâr her döndüğünde deniz bir yerden, kara başka bir
 * yerden aydınlanır ve resim ikiye bölünür.
 */
export function gunesYonu(THREE, P) {
  const y = P.gunesY;
  const azimut = P.gunesAci === undefined ? P.ruzgar + 150 : P.gunesAci;
  const a = azimut * Math.PI / 180;
  const yatay = Math.sqrt(Math.max(0, 1 - y * y));
  return new THREE.Vector3(Math.cos(a) * yatay, y, Math.sin(a) * yatay).normalize();
}
