// DÜNYA YÜZEYİ — WebGL2 katmanı (hibrit).
//
// Bu dosya haritanın MALZEMESİNİ çizer: deniz ve kara. Canvas2D'de yalnız
// MÜREKKEP ve bilgi katmanları kalır — ülke sınırı, province kenarı, hex
// ızgarası, etiket, şehir, birim, seçim, taramalar ve bütün arayüz.
//
// Yüzey, Canvas2D tuvalinin ALTINDAKİ ayrı bir tuvale çizilir; Canvas2D
// tarafı zemin dolgularını hiç boyamaz (bkz. renderer.glSurface) ve o alan
// saydam kalır. Yüzey alttan görünür, çizgiler üstünde durur — kare başına
// binlerce hexlik kırpma yolu yok.
//
// Neden GPU: hem su hem kara için eksik olan şey PİKSEL BAŞINA ışıktı.
// Canvas2D'de malzeme ancak önceden pişmiş bir rastere yazılabiliyordu, yani
// çözünürlüğü sabitti (hex başına 4 teksel) ve ışık eğim bilgisinden
// hesaplanamıyordu. Fragment shader tam olarak bunun için var.
//
// Oyun durumu KOPYALANMAZ. Ülke rengi, sahiplik ve arazi shader'a hex başına
// birer dokudan girer; renkleri üreten yer hâlâ renderer.tileColor'dır, yani
// harita kipleri, işgal ve kültür mantığı tek yerde kalır.
//
// Katman notu: DOM ve GPU'ya dokunur, oyun durumuna dokunmaz.

import { SQRT3 } from '../core/hex.js';
import { HEX_SIZE } from '../world/worldgen.js';
import { makeRng, fbm } from './textures.js';

const HEX_STEP = SQRT3 * HEX_SIZE;
const ROW_H = HEX_SIZE * 1.5;
const WRAP_X0 = -HEX_STEP / 2;

/** Kıyı uzaklığı dokusunun tavanı (dünya birimi). Ötesi "açık deniz". */
const DIST_MAX = HEX_STEP * 9;
/** Dalga dokusunun kenarı. 256 döşeme izini gizlemeye yetiyor (üç ölçek). */
const WAVE_SIZE = 256;
/** Su en fazla bu sıklıkta güncellenir (ms). Hareket zaten yavaş. */
const FRAME_MS = 33;

const VERT = `#version 300 es
// Tek üçgen tüm ekranı kaplar: dörtgene göre bir vertex az, kenar dikişi yok.
void main() {
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;
out vec4 fragColor;

uniform vec2 uViewport;     // CSS piksel
uniform float uDpr;
uniform vec2 uCam;          // dünya merkezi
uniform float uZoom;
uniform float uTime;        // saniye
uniform float uWrap;        // sarmal periyodu (0 = yok)
uniform vec2 uGrid;         // cols, rows
uniform float uHexSize;
uniform vec2 uFieldOrigin;  // uDist dokusunun dünya sol-üstü
uniform vec2 uFieldSpan;    // uDist dokusunun dünya en/boyu
uniform float uDistMax;     // uDist'in kodladığı azami uzaklık
uniform float uDetail;      // 0..1, zoom LOD

// Palet CANLI AYARLANABİLİR (bkz. WaterGL.tune). Denizin karakteri saf ayar
// meselesi ve her denemede sayfayı yeniden yükleyip dünyayı yeniden pişirmek
// 25 saniye tutuyordu; uniform olarak saniyeler içinde denenebiliyor.
uniform vec3 uShallow;
uniform vec3 uTeal;
uniform vec3 uPetrol;
uniform vec3 uAbyss;
uniform float uShelf;       // sığlık erimi çarpanı
uniform float uSpecAmp;
uniform float uFresAmp;
uniform float uFoamAmp;
uniform float uWaveAmp;     // normal eğimi
uniform float uWaveShade;   // dalganın ALBEDO'ya katkısı (görünür kabarma)
uniform float uRefract;     // sığlıkta kırılma payı

uniform sampler2D uHex;     // R8, NEAREST — 1 = su
uniform sampler2D uDist;    // R8, LINEAR  — kıyıya uzaklık / uDistMax
uniform sampler2D uOwner;   // RGBA8, NEAREST — hex basina taban renk (oyundan)
uniform sampler2D uChar;    // RGBA8, NEAREST — R kabartma, G gren, B sicaklik
uniform sampler2D uElev;    // R8,    LINEAR  — yukseklik rasteri
uniform vec2 uElevSize;     // yukseklik dokusunun teksel sayisi
uniform float uLandRelief;  // kabartma siddeti
uniform float uLandGrain;   // pigment siddeti
uniform float uGrade;       // kuresel derecelendirme siddeti
uniform sampler2D uWave;    // RGBA8, LINEAR, tekrar — RG normal.xy, B/A yükseklik

const float SQ3 = 1.7320508;

/** Dünya noktasının hangi hexe düştüğü — ANALİTİK, dolayısıyla tam. */
vec2 hexAt(vec2 w) {
  float r = (w.y * 2.0) / (3.0 * uHexSize);
  float q = w.x / (SQ3 * uHexSize) - r * 0.5;
  // Küp yuvarlama: üç eksenden en çok sapan yeniden türetilir.
  float x = q, z = r, y = -q - r;
  float rx = floor(x + 0.5), ry = floor(y + 0.5), rz = floor(z + 0.5);
  float dx = abs(rx - x), dy = abs(ry - y), dz = abs(rz - z);
  if (dx > dy && dx > dz) rx = -ry - rz;
  else if (dy > dz) ry = -rx - rz;
  else rz = -rx - ry;
  // axial -> offset (bkz. core/hex.axialToOffset)
  return vec2(rx + floor(rz * 0.5), rz);
}

/** Dalga dokusundan normal ve yükseklik; dünya uzayında, kayan. */
vec4 wave(vec2 w, float scale, vec2 vel, float rot) {
  float c = cos(rot), s = sin(rot);
  vec2 p = mat2(c, -s, s, c) * w;
  vec2 uv = (p + vel * uTime) / scale;
  return texture(uWave, uv);
}

/** Ucuz hash tabanli deger gurultusu; dunya uzayinda, cozunurlukten bagimsiz. */
float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash21(i), b = hash21(i + vec2(1, 0));
  float c = hash21(i + vec2(0, 1)), d = hash21(i + vec2(1, 1));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

/** Uc oktav. Piksel basina hesaplandigi icin her zoomda ayni keskinlikte. */
float pigmentNoise(vec2 p) {
  float v = vnoise(p) * 0.55;
  v += vnoise(p * 2.13 + 17.3) * 0.30;
  v += vnoise(p * 4.31 + 41.7) * 0.15;
  return v;
}

/** Yukseklik rasterinden egim; teksel adimiyla merkezi fark. */
vec2 elevGrad(vec2 uv, out float h) {
  vec2 tx = 1.0 / uElevSize;
  h = texture(uElev, uv).r;
  float l = texture(uElev, uv - vec2(tx.x, 0.0)).r;
  float r = texture(uElev, uv + vec2(tx.x, 0.0)).r;
  float u = texture(uElev, uv - vec2(0.0, tx.y)).r;
  float d = texture(uElev, uv + vec2(0.0, tx.y)).r;
  return vec2(l - r, u - d);
}

/**
 * KARA MALZEMESI.
 *
 *   ulke rengi (oyundan)  x  pigment  x  kabartma isigi  x  kuresel derece
 *
 * Ulke rengi NEAREST okunur: hex kenari tam kalir, siyasi okuma bozulmaz.
 * Kabartma gercek yukseklik rasterinden gelir (uydurma dag golgesi yok) ve
 * isik yonu SU ile aynidir — iki yuzey ayni dunyada gibi dursun (§22).
 */
vec3 landColor(vec2 world, vec2 cell, vec3 Ldir) {
  vec3 base = texture(uOwner, (cell + 0.5) / uGrid).rgb;
  vec4 ch = texture(uChar, (cell + 0.5) / uGrid);
  float reliefGain = ch.r * 2.0;
  float grainAmt = ch.g;
  float warmth = (ch.b - 0.5) * 2.0;

  // --- KABARTMA ---
  vec2 uv = (world - uFieldOrigin) / uFieldSpan;
  float h;
  vec2 g = elevGrad(uv, h);
  // Egim dunya birimine cevrilir, sonra araziye gore olceklenir.
  vec3 N = normalize(vec3(g * uLandRelief * reliefGain * 18.0, 1.0));
  float lam = dot(N, Ldir);
  // Yumusak yarim-Lambert: golge tarafi olmez, sirt yine one cikar.
  float shade = lam * 0.5 + 0.5;
  shade = pow(clamp(shade, 0.0, 1.0), 1.35);

  // --- PIGMENT ---
  // Uc olcek: genis boya kalinligi, orta leke, ince gren. Ince olan arazi
  // karakterine gore aciliyor (orman lekeli, col duz).
  float pg = pigmentNoise(world * 0.0055) - 0.5;
  float pf = pigmentNoise(world * 0.031) - 0.5;
  float pm = pigmentNoise(world * 0.11) - 0.5;
  float pig = pg * 0.55 + pf * 0.30 + pm * grainAmt * 0.55;

  vec3 col = base;
  // Kabartma CARPARAK biner: koyu ulke koyu kalir, oran korunur.
  col *= mix(1.0, shade * 1.55, uLandRelief > 0.0 ? 0.72 : 0.0);
  col *= 1.0 + pig * uLandGrain;
  // Isik/golge rengi: sirt sicak, cukur soguk (§23).
  float t = (shade - 0.5) * 2.0 + warmth * 0.35;
  col += vec3(0.028, 0.014, -0.020) * t * 0.55;
  return col;
}

void main() {
  vec2 px = gl_FragCoord.xy / uDpr;
  // Canvas2D ile aynı eksen: y aşağı.
  vec2 scr = vec2(px.x, uViewport.y - px.y);
  vec2 world = (scr - uViewport * 0.5) / uZoom + uCam;

  // --- KARA MASKESİ (tam hex kenarı) ---
  vec2 cr = hexAt(world);
  float col = cr.x;
  float row = cr.y;
  if (uWrap > 0.0) col = mod(col, uGrid.x);
  if (row < 0.0 || row > uGrid.y - 1.0) discard;
  vec2 cell = vec2(col, row);
  float isWater = texture(uHex, (cell + 0.5) / uGrid).r;
  // Isik yonu SU ile ORTAK: iki yuzeyin ayni dunyada olmasi buna bagli.
  vec3 Ldir = normalize(vec3(-0.55, -0.68, 0.48));
  if (isWater < 0.5) {
    vec3 land = landColor(world, cell, Ldir);
    // Kuresel derece: orta ton cevresinde S egrisi + soguk golge/sicak isik.
    vec3 gr = land * land * (3.0 - 2.0 * land);
    land = mix(land, gr, uGrade);
    fragColor = vec4(clamp(land, 0.0, 1.0), 1.0);
    return;
  }

  // --- DALGALAR (uzaklıktan ÖNCE: sığlık onların üstünden kırılacak) ---
  // ÜÇ oktav. İkiyle yetinildiğinde deniz "düz" kalıyordu: iki frekans
  // yalnız geniş bir kabarma veriyor, gözün dalga saydığı orta ve ince
  // ölçek eksik kalıyordu.
  vec4 w1 = wave(world, 980.0, vec2(4.2, -2.6), 0.0);
  vec4 w2 = wave(world, 330.0, vec2(-7.5, 4.4), 1.05);
  vec4 w3 = wave(world, 118.0, vec2(11.0, -6.5), 2.35);
  vec2 n1 = (w1.rg - 0.5) * 2.0;
  vec2 n2 = (w2.rg - 0.5) * 2.0;
  vec2 n3 = (w3.rg - 0.5) * 2.0;
  vec2 nxy = n1 + n2 * (0.55 + 0.35 * uDetail) + n3 * (0.15 + 0.55 * uDetail);

  // DALGA YÜKSEKLİĞİ. Asıl eksik buydu: normaller yalnız Fresnel ve
  // spekülara giriyordu, yani sadece IŞIĞI taşıyorlardı. Dalganın kendisi
  // ancak taban rengi oynayınca görünür — sırt açılır, çukur koyulaşır.
  float hgt = (w1.b - 0.5) * 1.00
            + (w2.b - 0.5) * 0.62
            + (w3.a - 0.5) * 0.38;

  // --- KIYI UZAKLIĞI (dalga eğimiyle KIRILMIŞ) ---
  // Sığ suda dip, yüzeydeki eğim yüzünden kaymış görünür. Uzaklık alanını
  // normalle ötelemek bunun ucuz karşılığı: sığlık sınırı dalgayla oynar,
  // düz bir kontur olmaktan çıkar. Derinde etkisi sönümlenir.
  float t0 = clamp(texture(uDist, (world - uFieldOrigin) / uFieldSpan).r
                   * uDistMax / (uHexSize * 9.0 * uShelf), 0.0, 1.0);
  vec2 refr = nxy * uHexSize * uRefract * (1.0 - smoothstep(0.0, 0.55, t0));
  vec2 fuv = (world + refr - uFieldOrigin) / uFieldSpan;
  float dist = texture(uDist, fuv).r * uDistMax;

  // --- ÇOK GENİŞ ÖLÇEKLİ YAPI ---
  // Açık deniz kıyı görünmeden de derin okunmalı: kıta boyunda karanlık ve
  // aydınlık kuşaklar. Alan bulut lekesi olmasın diye alan BÜKÜLÜR (domain
  // warp): iki düşük frekans birbirini kaydırır, sonuç akıntı gibi uzar.
  vec2 warp = (wave(world, 5200.0, vec2(0.0), 0.0).ba - 0.5) * 900.0;
  float broad = wave(world + warp, 3100.0, vec2(1.1, -0.7), 0.4).b;
  broad = broad * 2.0 - 1.0;

  // --- DERİNLİK PALETİ ---
  // Kıyıdan açığa: kısık turkuaz-yeşil → derin teal → petrol → siyaha yakın
  // lacivert-teal. Parlak camgöbeği ve tropik doygunluk YOK.
  float t = clamp(dist / (uHexSize * 9.0 * uShelf), 0.0, 1.0);
  vec3 base = mix(uShallow, uTeal, smoothstep(0.0, 0.24, t));
  base = mix(base, uPetrol, smoothstep(0.20, 0.55, t));
  base = mix(base, uAbyss, smoothstep(0.48, 1.0, t));
  // Geniş yapı TOPLANARAK biner, çarpılarak değil. Koyu bir tabanda çarpım
  // hiçbir şey yapmaz: 0.03 tabanın %20'si 0.006, yani algı eşiğinin çok
  // altı. Canvas2D geçişinde aynı hataya düşülmüştü; burada da aynı ders.
  base += broad * vec3(0.014, 0.024, 0.028);
  // Sırt/çukur doğrudan tabana biner. Çarpım oranı korur (koyu su koyu
  // kalır), küçük toplam ise sırtlara hafif bir ışık payı verir.
  base *= 1.0 + hgt * uWaveShade;
  base += vec3(0.016, 0.030, 0.033) * max(0.0, hgt) * uWaveShade;

  // --- NORMAL ---
  // Sığlıkta dalga sönümlenir; dip sürtünmesinin ucuz taklidi.
  nxy *= mix(0.50, 1.0, smoothstep(0.0, 0.30, t));
  vec3 N = normalize(vec3(nxy * uWaveAmp, 1.0));

  // --- FRESNEL (taklit) ---
  // Tepeden bakılan bir haritada gerçek bakış açısı yok; sanal olarak hafif
  // eğik bir bakış varsayılır. Dalga eğimi arttıkça yüzey daha yansıtıcı
  // olur — "ıslak" izlenimini veren şey budur. Ayna yansıması YOK.
  vec3 V = normalize(vec3(0.16, 0.30, 1.0));
  float fres = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 2.0);
  // Yansıma tonu SOĞUK ve koyu: gökyüzü değil, kurşuni bir gün ışığı. Ayna
  // yansıması yok, yalnız ıslaklık izlenimi.
  vec3 skyTone = vec3(0.176, 0.235, 0.267);
  vec3 col3 = mix(base, skyTone, clamp(fres * uFresAmp, 0.0, 0.60));

  // --- YÖNLÜ SPEKÜLAR ---
  // Tek küresel ışık. Üs düşük tutulur: geniş ve yumuşak vurgu, kıvılcım
  // değil. Parıldayan okyanus istenmiyor.
  vec3 H = normalize(Ldir + V);
  // ÜS YÜKSEK OLMALI. Tepeden bakılan bir haritada hem ışık hem bakış dikeye
  // yakındır, dolayısıyla H de dikeydir: DÜZ su bile dot(N,H)≈0.93 verir.
  // Üs 22'de bu 0.93^22 = 0.20 demekti, yani okyanusun TAMAMI aydınlanıyor ve
  // geniş soluk lekeler oluşuyordu (ilk denemede görülen hata). 80'de düz su
  // 0.003'e iner; vurgu yalnız dalganın gerçekten ışığa döndüğü yerde çıkar.
  float spec = pow(max(dot(N, H), 0.0), 60.0);
  // Seyreklik: yalnız geniş ölçekli alanın aydınlık kuşaklarında görünür.
  spec *= 0.35 + 0.65 * smoothstep(-0.25, 0.55, broad);
  col3 += vec3(0.50, 0.56, 0.57) * spec * uSpecAmp * (0.45 + 0.55 * uDetail);

  // --- KIYI ---
  // LAND → dar koyu temas kenarı → KIRIK soluk köpük → sığ teal → derin su.
  // Köpük sürekli DEĞİL: eşik gürültüyle kırılır, genişliği yer yer sıfıra
  // iner. Turkuaz hale yok.
  float edge = 1.0 - smoothstep(0.0, uHexSize * 0.42, dist);
  col3 *= 1.0 - edge * 0.42;

  // Köpük bandı: kıyıdan ~1.6 hex içeri. Kırılma TOPLAMLA yapılır, çarpımla
  // değil — iki gürültünün çarpımı ortalama 0.25'e çöküyor ve eşik neredeyse
  // hiç aşılmıyordu (ilk denemede köpük görünmüyordu).
  float band = (1.0 - smoothstep(uHexSize * 0.22, uHexSize * 1.05, dist))
             * smoothstep(0.0, uHexSize * 0.16, dist);
  float chop = wave(world, 190.0, vec2(3.4, -2.0), 2.1).b * 0.6
             + wave(world, 58.0, vec2(5.5, -3.0), 0.7).a * 0.4;
  // Eşik gürültünün KENDİSİYLE oynatılır: köpüğün genişliği kıyı boyunca
  // değişir, yer yer tamamen kesilir. Sürekli bir şerit istenmiyor.
  //
  // Eşik YÜKSEK tutulur. 0.40'ta chop degerinin (ortalama ~0.5) yarisi geciyor
  // ve köpük bandın tamamını dolduruyordu: kıyıyı saran kesintisiz soluk bir
  // hale — briefin açıkça yasakladığı şey. 0.60'ta yalnız üst kuyruk geçer.
  float gate = 0.52 + 0.19 * (wave(world, 940.0, vec2(0.8, -0.5), 1.4).b - 0.5) * 2.0;
  float foam = band * smoothstep(gate, gate + 0.11, chop);
  foam *= 0.6 + 0.4 * uDetail;
  col3 = mix(col3, vec3(0.58, 0.64, 0.63), clamp(foam * uFoamAmp, 0.0, 0.62));

  fragColor = vec4(col3, 1.0);
}`;

function compile(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error('shader: ' + log);
  }
  return sh;
}

/**
 * Döşenebilir dalga dokusu: RG normalin xy'si, B ve A iki bağımsız yükseklik
 * alanı. Normal CPU'da sonlu farkla çıkarılır — shader'da her karede türev
 * almaktan çok daha ucuz ve doku zaten döşenebilir.
 */
/**
 * Alanı verilen yönde sarmalı olarak yayar: tepeler o yönde UZAR.
 *
 * İzotropik gürültü denizde "leke" okunur; gerçek dalganın sırtı yayılma
 * yönüne dik uzun bir çizgidir. Yayma, dokuyu döşenebilir bırakarak bu
 * uzamayı verir — gerçekçiliğin tek en büyük kaldıracı bu.
 */
function smear(src, size, dx, dy, taps) {
  const out = new Float32Array(src.length);
  const n = taps * 2 + 1;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let sum = 0;
      for (let k = -taps; k <= taps; k++) {
        const sx = (((x + k * dx) % size) + size) % size;
        const sy = (((y + k * dy) % size) + size) % size;
        sum += src[sy * size + sx];
      }
      out[y * size + x] = sum / n;
    }
  }
  return out;
}

function buildWaveTexture() {
  const size = WAVE_SIZE;
  // İki alan, İKİ AYRI yönde yayılmış: üst üste bindiklerinde tek yönlü bir
  // tarama deseni değil, kesişen kabarma aileleri çıkar.
  const h = smear(fbm(size, size, [4, 8, 16, 32], makeRng(20260903)), size, 3, -1, 5);
  const h2 = smear(fbm(size, size, [3, 7, 15], makeRng(77120451)), size, 1, 3, 4);
  // Yayma değer aralığını daraltır; eşikler ve eğimler anlamlı kalsın diye
  // her iki alan 0..1'e geri gerilir.
  for (const f of [h, h2]) {
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = 0; i < f.length; i++) {
      if (f[i] < lo) lo = f[i];
      if (f[i] > hi) hi = f[i];
    }
    const span = Math.max(1e-6, hi - lo);
    for (let i = 0; i < f.length; i++) f[i] = (f[i] - lo) / span;
  }
  const data = new Uint8Array(size * size * 4);
  const at = (x, y) => h[(((y % size) + size) % size) * size + (((x % size) + size) % size)];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const gx = (at(x + 1, y) - at(x - 1, y)) * 0.5;
      const gy = (at(x, y + 1) - at(x, y - 1)) * 0.5;
      const p = i * 4;
      data[p] = Math.round(Math.max(0, Math.min(1, 0.5 - gx * 6)) * 255);
      data[p + 1] = Math.round(Math.max(0, Math.min(1, 0.5 - gy * 6)) * 255);
      data[p + 2] = Math.round(h[i] * 255);
      data[p + 3] = Math.round(h2[i] * 255);
    }
  }
  return { data, size };
}

export class SurfaceGL {
  /** WebGL2 yoksa null döner: çağıran Canvas2D suyuna geri düşer. */
  static create(canvas) {
    const gl = canvas.getContext('webgl2', {
      alpha: true, antialias: false, depth: false, stencil: false,
      premultipliedAlpha: true, powerPreference: 'high-performance',
    });
    if (!gl) return null;
    try {
      return new SurfaceGL(canvas, gl);
    } catch {
      return null;
    }
  }

  constructor(canvas, gl) {
    this.canvas = canvas;
    this.gl = gl;
    this.world = null;
    this.dpr = 1;
    /**
     * Su ÇÖZÜNÜRLÜĞÜ tam kare değil: malzeme düşük frekanslı olduğu için
     * 0.75x'te fark görünmez, piksel işi %44 azalır.
     */
    this.resScale = 0.75;
    this.lastDraw = 0;
    this.debug = { enabled: true };
    /**
     * Denizin karakteri. Konsoldan canlı değiştirilebilir:
     *   game.renderer.waterGL.tune.abyss = [0.05, 0.12, 0.15]
     *   game.renderer.waterGL.draw(game.camera, performance.now()/1000, true)
     */
    /**
     * Varsayılan palet REFERANSLARDAN okundu (FENESHGARD ve KAZYLSTAN
     * kareleri): açık deniz KOYU DEĞİL, orta tonda aydınlık bir teal; kıyıda
     * belirgin daha parlak bir şelf; derinlik farkı renkle de anlatılıyor.
     *
     * Not: bu, ikinci brifingin "deep petrol / charcoal cyan, parlak camgöbeği
     * YOK" yönergesinden bilinçli bir sapmadır. O yönergeye göre ayarlanan
     * palet (abis 0.025/0.066/0.086) referansların yanında ölü kalıyordu —
     * seçim referans karelerinden yana yapıldı.
     */
    this.tune = {
      shallow: [0.290, 0.560, 0.570],
      teal: [0.165, 0.335, 0.365],
      petrol: [0.108, 0.240, 0.272],
      abyss: [0.078, 0.180, 0.210],
      shelf: 1.15,
      spec: 0.55,
      fresnel: 1.90,
      foam: 0.70,
      /**
       * Dalganın görünürlüğü. `waveShade` TABAN RENGİ oynatır (asıl kabarma),
       * `waveAmp` normal eğimi (ışık), `refract` sığlıktaki kırılma.
       *
       * Ayarlar yüksekken (shade 0.60 / amp 1.70 / spec 1.15) deniz "sis
       * bankası" okunuyordu: güçlü normaller speküları sırtlar boyunca sürekli
       * ateşliyor ve beyaz şeritler çıkıyordu. Kabarmanın görünmesi için
       * gereken şey parlaklık değil, taban renginin oynaması.
       */
      waveAmp: 1.15,
      waveShade: 0.26,
      refract: 0.60,
      // KARA. `relief` yükseklik eğiminin ışığa katkısı, `grain` pigmentin
      // gücü, `grade` küresel S eğrisinin payı.
      relief: 1.0,
      grain: 0.55,
      grade: 0.30,
    };

    const prog = gl.createProgram();
    gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error('program: ' + gl.getProgramInfoLog(prog));
    }
    this.prog = prog;
    this.vao = gl.createVertexArray();
    this.u = {};
    for (const name of ['uViewport', 'uDpr', 'uCam', 'uZoom', 'uTime', 'uWrap',
      'uGrid', 'uHexSize', 'uFieldOrigin', 'uFieldSpan', 'uDistMax', 'uDetail',
      'uHex', 'uDist', 'uWave',
      'uShallow', 'uTeal', 'uPetrol', 'uAbyss', 'uShelf',
      'uSpecAmp', 'uFresAmp', 'uFoamAmp',
      'uWaveAmp', 'uWaveShade', 'uRefract',
      'uOwner', 'uChar', 'uElev', 'uElevSize',
      'uLandRelief', 'uLandGrain', 'uGrade']) {
      this.u[name] = gl.getUniformLocation(prog, name);
    }

    const wave = buildWaveTexture();
    this.waveTex = this.makeTex(gl.RGBA8, gl.RGBA, wave.size, wave.size, wave.data,
      gl.LINEAR, gl.REPEAT);
    this.hexTex = null;
    this.distTex = null;
    this.ownerTex = null;
    this.charTex = null;
    this.elevTex = null;
  }

  makeTex(internal, format, w, h, data, filter, wrap, wrapT = wrap) {
    const gl = this.gl;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, format, gl.UNSIGNED_BYTE, data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrapT);
    return tex;
  }

  /**
   * Dünya verisi: hex başına su bayrağı (tam maske) ve kıyı uzaklığı alanı.
   *
   * Uzaklık alanı LandMaterial'ın zaten hesapladığı chamfer dönüşümünden
   * gelir (bkz. material.js) — aynı işi iki kez yapmanın anlamı yok ve iki
   * katmanın kıyısı böylece bit bit aynı yerde.
   */
  setWorld(world, coast, surfaceData) {
    if (this.world === world && this.hexTex && this.distTex) return true;
    if (!coast?.toLand || !coast?.surface || !surfaceData) return false;
    const gl = this.gl;
    const cols = world.cols;
    const rows = world.rows;

    const hex = new Uint8Array(cols * rows);
    for (let i = 0; i < hex.length; i++) {
      const t = world.tiles[i];
      hex[i] = t && t.terrain.water ? 255 : 0;
    }
    if (this.hexTex) gl.deleteTexture(this.hexTex);
    this.hexTex = this.makeTex(gl.R8, gl.RED, cols, rows, hex,
      gl.NEAREST, gl.REPEAT, gl.CLAMP_TO_EDGE);

    const { toLand, w, h } = coast;
    const dist = new Uint8Array(w * h);
    for (let i = 0; i < dist.length; i++) {
      dist[i] = Math.min(255, Math.round((toLand[i] / DIST_MAX) * 255));
    }
    if (this.distTex) gl.deleteTexture(this.distTex);
    this.distTex = this.makeTex(gl.R8, gl.RED, w, h, dist,
      gl.LINEAR, gl.REPEAT, gl.CLAMP_TO_EDGE);

    // --- KARA DOKULARI ---
    // Taban renk OYUNDAN gelir: renderer.tileColor her hex için ne
    // döndürüyorsa o. Harita kipleri, işgal, kültür — hepsi tek yerde kalır,
    // shader kendi doğrusunu kurmaz.
    if (this.ownerTex) gl.deleteTexture(this.ownerTex);
    this.ownerTex = this.makeTex(gl.RGBA8, gl.RGBA, cols, rows, surfaceData.owner,
      gl.NEAREST, gl.REPEAT, gl.CLAMP_TO_EDGE);
    if (this.charTex) gl.deleteTexture(this.charTex);
    this.charTex = this.makeTex(gl.RGBA8, gl.RGBA, cols, rows, surfaceData.character,
      gl.NEAREST, gl.REPEAT, gl.CLAMP_TO_EDGE);

    // Yükseklik: material.js'in zaten kurduğu yumuşatılmış raster (hex başına
    // 4 teksel). LINEAR örneklenir ve eğim shader'da alınır — kabartma böylece
    // ekran çözünürlüğünden bağımsız olur, önceden pişmiş bir gölge değildir.
    const surf = coast.surface;
    const elev = new Uint8Array(surf.length);
    for (let i = 0; i < surf.length; i++) {
      elev[i] = Math.max(0, Math.min(255, Math.round(surf[i] * 255)));
    }
    if (this.elevTex) gl.deleteTexture(this.elevTex);
    this.elevTex = this.makeTex(gl.R8, gl.RED, coast.w, coast.h, elev,
      gl.LINEAR, gl.REPEAT, gl.CLAMP_TO_EDGE);
    this.elevSize = { w: coast.w, h: coast.h };

    this.world = world;
    this.grid = { cols, rows };
    this.field = {
      x0: WRAP_X0, y0: -ROW_H / 2,
      spanX: cols * HEX_STEP, spanY: rows * ROW_H,
    };
    return true;
  }

  /**
   * Sahiplik değişince YALNIZ renk dokusu tazelenir (§33). Yükseklik, kıyı
   * alanı ve arazi karakteri coğrafyaya bağlıdır, dokunulmaz.
   */
  updateOwners(ownerData) {
    if (!this.ownerTex || !this.world) return;
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.ownerTex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, this.grid.cols, this.grid.rows,
      gl.RGBA, gl.UNSIGNED_BYTE, ownerData);
    this.lastDraw = 0;
  }

  resize(cssW, cssH, dpr) {
    const w = Math.max(1, Math.round(cssW * dpr * this.resScale));
    const h = Math.max(1, Math.round(cssH * dpr * this.resScale));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.cssW = cssW;
    this.cssH = cssH;
    this.dpr = dpr * this.resScale;
  }

  /** Kamera/zaman değişmediyse çizmeye gerek yok. */
  draw(camera, time, force = false) {
    if (!this.world || !this.debug.enabled) return false;
    const now = performance.now();
    const moved = this.lastCam?.x !== camera.x || this.lastCam?.y !== camera.y
      || this.lastCam?.zoom !== camera.zoom;
    if (!force && !moved && now - this.lastDraw < FRAME_MS) return false;
    this.lastDraw = now;
    this.lastCam = { x: camera.x, y: camera.y, zoom: camera.zoom };

    const gl = this.gl;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.prog);
    gl.bindVertexArray(this.vao);

    const u = this.u;
    gl.uniform2f(u.uViewport, this.cssW, this.cssH);
    gl.uniform1f(u.uDpr, this.dpr);
    gl.uniform2f(u.uCam, camera.x, camera.y);
    gl.uniform1f(u.uZoom, camera.zoom);
    gl.uniform1f(u.uTime, time);
    gl.uniform1f(u.uWrap, this.world.wrapWidth || 0);
    gl.uniform2f(u.uGrid, this.grid.cols, this.grid.rows);
    gl.uniform1f(u.uHexSize, HEX_SIZE);
    gl.uniform2f(u.uFieldOrigin, this.field.x0, this.field.y0);
    gl.uniform2f(u.uFieldSpan, this.field.spanX, this.field.spanY);
    gl.uniform1f(u.uDistMax, DIST_MAX);
    // LOD: yakınlaştıkça ince kırışıklık ve spekülar payı açılır.
    gl.uniform1f(u.uDetail, Math.max(0, Math.min(1, (camera.zoom - 0.35) / 1.1)));
    const T = this.tune;
    gl.uniform3fv(u.uShallow, T.shallow);
    gl.uniform3fv(u.uTeal, T.teal);
    gl.uniform3fv(u.uPetrol, T.petrol);
    gl.uniform3fv(u.uAbyss, T.abyss);
    gl.uniform1f(u.uShelf, T.shelf);
    gl.uniform1f(u.uSpecAmp, T.spec);
    gl.uniform1f(u.uFresAmp, T.fresnel);
    gl.uniform1f(u.uFoamAmp, T.foam);
    gl.uniform1f(u.uWaveAmp, T.waveAmp);
    gl.uniform1f(u.uWaveShade, T.waveShade);
    gl.uniform1f(u.uRefract, T.refract);
    gl.uniform1f(u.uLandRelief, T.relief);
    gl.uniform1f(u.uLandGrain, T.grain);
    gl.uniform1f(u.uGrade, T.grade);
    gl.uniform2f(u.uElevSize, this.elevSize.w, this.elevSize.h);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.hexTex);
    gl.uniform1i(u.uHex, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.distTex);
    gl.uniform1i(u.uDist, 1);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.waveTex);
    gl.uniform1i(u.uWave, 2);
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, this.ownerTex);
    gl.uniform1i(u.uOwner, 3);
    gl.activeTexture(gl.TEXTURE4);
    gl.bindTexture(gl.TEXTURE_2D, this.charTex);
    gl.uniform1i(u.uChar, 4);
    gl.activeTexture(gl.TEXTURE5);
    gl.bindTexture(gl.TEXTURE_2D, this.elevTex);
    gl.uniform1i(u.uElev, 5);

    gl.drawArrays(gl.TRIANGLES, 0, 3);
    return true;
  }
}
