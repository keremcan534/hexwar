// VIC3 AYRINTI DOKULARI — çalışma anında GPU'da üretilen, mip'li dizi doku.
//
// Neden çalışma anında ve GPU'da: yakın zoomda bir hex ~118 GL pikseli ve
// içini dolduracak ayrıntı (ağaç tacı, tarla parseli, kaya katmanı) hex
// verisinde yok. Dosyadan doku yüklemek bağımlılık/varlık hattı ister; CPU'da
// 12 katman × 512² üretmek ~yüz milisaniyeler tutar. Tek bir tam ekran
// üçgeniyle katman başına bir çizim, toplam birkaç ms GPU'dur ve bağlam
// kaybından sonra aynı kaynaktan yeniden kurulur (CPU kopyası gerekmez).
//
// Her katman KENDİ İÇİNDE DÖŞENİR (gürültü kafesi döşeme başına tam sayı
// hücre): dünya uv'si döşemeyi dünya enine tam sayı kez sığdırdığı için
// sarmal dikişinde desen kesintisiz devam eder.
//
// Kanallar: R albedo (ortalama ~0.5; kesin ortalama üretimden sonra en
// küçük mip'ten okunur, shader oranla kullanır: ortalama korunur), G
// yükseklik (biyomlar arası yükseklikle karıştırma), BA yükseklik eğimi
// (0.5 + eğim × GRAD_SCALE; ışık stilin shader'ında Ldir ile kurulur).
//
// Katman notu: yalnız render; DOM'a dokunmaz (gl bağlamı çağırandan gelir).

export const VIC_LAYERS = ['forest', 'jungle', 'grass', 'steppe', 'desert', 'tundra',
  'snow', 'rock', 'marsh', 'beach', 'fields', 'urban'];
export const VIC_TEX_SIZE = 512;
/** Üretimde eğim kodlaması: teksel başına yükseklik farkı × bu. */
export const GRAD_SCALE = 2.0;

const VS = `#version 300 es
void main() {
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const FS = `#version 300 es
precision highp float;
precision highp int;
out vec4 oCol;
uniform float uSize;

uint hashU(uvec3 v) {
  v = v * 1664525u + 1013904223u;
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
  v ^= v >> 16u;
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
  return v.x ^ v.y ^ v.z;
}
// Negatif tam sayıda % tanımsız (GLSL ES 3.00): döşeme kalanı floor ile.
ivec2 wrapC(ivec2 c, ivec2 n) { return c - n * ivec2(floor(vec2(c) / vec2(n))); }
float hash1(ivec2 c, ivec2 n, uint s) {
  uvec2 w = uvec2(wrapC(c, n));
  return float(hashU(uvec3(w, s)) & 0xFFFFFFu) / 16777215.0;
}
vec4 hash4(ivec2 c, ivec2 n, uint s) {
  uvec2 w = uvec2(wrapC(c, n));
  uint a = hashU(uvec3(w, s));
  uint b = hashU(uvec3(w, s + 7919u));
  return vec4(float(a & 0xFFFFu), float(a >> 16u), float(b & 0xFFFFu), float(b >> 16u)) / 65535.0;
}
/** Döşenen gradyan gürültüsü; p hücre biriminde, n döşeme başına hücre. ~[-1, 1]. */
float gnoise(vec2 p, ivec2 n, uint s) {
  vec2 i = floor(p);
  vec2 f = p - i;
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  ivec2 c = ivec2(i);
  float a0 = hash1(c, n, s) * 6.2831853;
  float a1 = hash1(c + ivec2(1, 0), n, s) * 6.2831853;
  float a2 = hash1(c + ivec2(0, 1), n, s) * 6.2831853;
  float a3 = hash1(c + ivec2(1, 1), n, s) * 6.2831853;
  float v0 = dot(vec2(cos(a0), sin(a0)), f);
  float v1 = dot(vec2(cos(a1), sin(a1)), f - vec2(1.0, 0.0));
  float v2 = dot(vec2(cos(a2), sin(a2)), f - vec2(0.0, 1.0));
  float v3 = dot(vec2(cos(a3), sin(a3)), f - vec2(1.0, 1.0));
  return mix(mix(v0, v1, u.x), mix(v2, v3, u.x), u.y) * 1.4;
}
/** Döşenen fBm; uv döşemede [0,1), n0 ilk oktavın hücre sayısı (x, y ayrı olabilir). */
float fbm(vec2 uv, ivec2 n0, int oct, uint s) {
  float sum = 0.0;
  float amp = 0.5;
  float norm = 0.0;
  ivec2 n = n0;
  for (int k = 0; k < 7; k++) {
    if (k >= oct) break;
    sum += gnoise(uv * vec2(n), n, s + uint(k) * 101u) * amp;
    norm += amp;
    amp *= 0.5;
    n *= 2;
  }
  return sum / norm;
}

/** Loblu taç: yarıçap açıya göre dalgalanır (yuvarlak kabarcık değil, yaprak kümesi). */
float lobed(vec2 d, float rad, vec4 r) {
  float ang = atan(d.y, d.x);
  float lob = 1.0 + 0.14 * sin(ang * 5.0 + r.x * 6.2831853) + 0.07 * sin(ang * 8.0 + r.y * 6.2831853);
  float dd = length(d) / (rad * lob);
  return dd < 1.0 ? sqrt(1.0 - dd * dd) : 0.0;
}

/**
 * AĞAÇ TAÇLARI: ızgara hücresi başına en çok bir taç (olasılık cover), 3x3
 * komşunun en yükseği. x yükseklik (kubbe), y taç kimliği (ton sapması).
 */
vec2 crowns(vec2 uv, int N, uint s, float cover, float r0, float r1, float lobes) {
  vec2 p = uv * float(N);
  vec2 ip = floor(p);
  vec2 f = p - ip;
  ivec2 c0 = ivec2(ip);
  float best = 0.0;
  float id = 0.5;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      ivec2 c = c0 + ivec2(i, j);
      vec4 r = hash4(c, ivec2(N), s);
      if (r.w > cover) continue;
      vec2 ctr = vec2(float(i), float(j)) + 0.2 + r.xy * 0.6;
      float rad = mix(r0, r1, r.z);
      float dome;
      if (lobes > 0.5) dome = lobed(f - ctr, rad, r);
      else {
        float d = length(f - ctr) / rad;
        dome = d < 1.0 ? sqrt(1.0 - d * d) : 0.0;
      }
      dome *= 0.72 + 0.28 * r.z;
      if (dome > best) {
        best = dome;
        id = fract(r.x * 7.31 + r.y * 3.17);
      }
    }
  }
  return vec2(best, id);
}

// ---- katmanlar: h yükseklik [0,1], a albedo (~0.5 ortalama) ----
// Gölge katmana özel yazılmaz: main() her katmanda yükseklikten güneşe doğru
// yürüyerek düşen gölgeyi albedoya işler (ağaç, çit, ev, kumul aynı kuralla).

#if LAYER == 0
void lForest(vec2 uv, out float h, out float a) {
  float clump = fbm(uv, ivec2(5), 3, 11u);
  vec2 big = crowns(uv, 44, 21u, 0.78 + clump * 0.60, 0.52, 0.86, 1.0);
  vec2 sml = crowns(uv, 76, 31u, 0.55 + clump * 0.50, 0.45, 0.75, 1.0);
  float hs = sml.x * 0.70;
  float hb = max(big.x, hs);
  float id = big.x >= hs ? big.y : sml.y;
  float leaf = gnoise(uv * 320.0, ivec2(320), 45u);
  h = hb + leaf * 0.06 * smoothstep(0.0, 0.3, hb);
  float crown = smoothstep(0.0, 0.2, hb);
  float tone = 0.62 + (id - 0.5) * 0.30 + fbm(uv, ivec2(20), 2, 41u) * 0.10 + leaf * 0.05;
  float ground = 0.22 + fbm(uv, ivec2(40), 2, 47u) * 0.06;
  a = mix(ground, tone, crown);
}
#endif

#if LAYER == 1
void lJungle(vec2 uv, out float h, out float a) {
  float clump = fbm(uv, ivec2(4), 3, 13u);
  vec2 big = crowns(uv, 32, 23u, 0.95 + clump * 0.3, 0.62, 1.0, 1.0);
  vec2 mid = crowns(uv, 58, 33u, 0.88, 0.50, 0.86, 1.0);
  float hm = mid.x * 0.80;
  float hb = max(big.x, hm);
  float id = big.x >= hm ? big.y : mid.y;
  float leaf = gnoise(uv * 384.0, ivec2(384), 49u);
  h = hb + leaf * 0.07 * smoothstep(0.0, 0.3, hb);
  float crown = smoothstep(0.0, 0.16, hb);
  a = mix(0.20, 0.60 + (id - 0.5) * 0.36 + fbm(uv, ivec2(14), 3, 43u) * 0.08 + leaf * 0.05, crown);
}
#endif

#if LAYER == 2
void lGrass(vec2 uv, out float h, out float a) {
  float base = fbm(uv, ivec2(7), 5, 51u);
  float patchy = fbm(uv, ivec2(3), 3, 55u);
  float streak = fbm(uv, ivec2(96, 24), 3, 53u);
  vec2 shrub = crowns(uv, 64, 57u, smoothstep(0.08, 0.36, patchy) * 0.40, 0.36, 0.62, 1.0);
  h = 0.20 + base * 0.12 + streak * 0.02 + shrub.x * 0.70;
  a = 0.54 + base * 0.15 + streak * 0.02;
  // Çalı tepesi zeminden koyu OLMAZ (koyu tepe + aydınlık kenar krater gibi
  // okunuyordu); bitkiyi boyu ve düşen gölgesi anlatır.
  a = mix(a, 0.47 + (shrub.y - 0.5) * 0.10, smoothstep(0.0, 0.25, shrub.x));
}
#endif

#if LAYER == 3
void lSteppe(vec2 uv, out float h, out float a) {
  float base = fbm(uv, ivec2(6), 5, 61u);
  float streak = fbm(uv, ivec2(128, 20), 3, 63u);
  float bare = smoothstep(0.02, 0.24, fbm(uv, ivec2(9), 4, 65u));
  vec2 tuft = crowns(uv, 110, 67u, 0.22, 0.28, 0.50, 0.0);
  h = 0.25 + base * 0.15 + streak * 0.02 + tuft.x * 0.40;
  a = 0.48 + base * 0.12 + streak * 0.04 + bare * 0.14;
  a *= 1.0 - smoothstep(0.0, 0.3, tuft.x) * 0.06;
}
#endif

float duneProfile(float s, float crest) {
  return s < crest ? smoothstep(0.0, crest, s) : 1.0 - smoothstep(crest, 1.0, s);
}

#if LAYER == 4
void lDesert(vec2 uv, out float h, out float a) {
  float warp = fbm(uv, ivec2(3), 3, 71u);
  // Tam sayı katsayılar: dalga cephesi döşemeye tam sayı kez sığar.
  float d1 = duneProfile(fract(uv.x * 5.0 + uv.y * 3.0 + warp * 1.6), 0.72);
  float d2 = duneProfile(fract(-uv.x * 4.0 + uv.y * 9.0 + warp * 2.3 + fbm(uv, ivec2(6), 2, 73u) * 0.6), 0.76);
  float rip = sin(6.2831853 * (uv.x * 70.0 + uv.y * 26.0 + warp * 9.0)) * 0.5 + 0.5;
  h = d1 * 0.62 + d2 * 0.26 + rip * 0.04 + fbm(uv, ivec2(12), 3, 75u) * 0.05;
  a = 0.50 + (d1 - 0.5) * 0.08 + fbm(uv, ivec2(9), 4, 77u) * 0.12;
}
#endif

/** Tundra: liken lekeleri, don tümsekleri, sığ göletler (çokgen çatlak yok: ızgara gibi okunuyordu). */
#if LAYER == 5
void lTundra(vec2 uv, out float h, out float a) {
  float lich = fbm(uv, ivec2(14), 4, 83u);
  float base = fbm(uv, ivec2(6), 4, 85u);
  vec2 shrub = crowns(uv, 96, 87u, 0.18 + max(lich, 0.0) * 0.4, 0.30, 0.55, 1.0);
  float pond = smoothstep(0.26, 0.31, fbm(uv, ivec2(8), 4, 89u));
  h = (0.35 + base * 0.12 + shrub.x * 0.45) * (1.0 - pond);
  a = 0.52 + lich * 0.26;
  a = mix(a, 0.44 + (shrub.y - 0.5) * 0.08, smoothstep(0.0, 0.25, shrub.x));
  a = mix(a, 0.30, pond);
}
#endif

#if LAYER == 6
void lSnow(vec2 uv, out float h, out float a) {
  float base = fbm(uv, ivec2(4), 5, 91u);
  float sast = 1.0 - abs(fbm(uv, ivec2(40, 10), 3, 93u));
  h = 0.5 + base * 0.35 + sast * 0.08;
  a = 0.50 + fbm(uv, ivec2(10), 3, 95u) * 0.06;
}
#endif

/** Kaya: sırtlı gürültü + testere dişi katman + kıvrık çatlak çizgileri + moloz. */
#if LAYER == 7
void lRock(vec2 uv, out float h, out float a) {
  float r = 1.0 - abs(fbm(uv, ivec2(6), 5, 101u));
  float warp = fbm(uv, ivec2(3), 3, 103u);
  float ph = uv.y * 14.0 + uv.x * 2.0 + warp * 2.5;
  float fr = fract(ph);
  float saw = smoothstep(0.0, 0.85, fr) * (1.0 - smoothstep(0.85, 1.0, fr));
  float crackN = abs(gnoise(uv * 18.0 + warp * 3.0, ivec2(18), 105u));
  float crack = 1.0 - smoothstep(0.0, 0.05, crackN);
  vec2 peb = crowns(uv, 150, 107u, 0.45, 0.35, 0.70, 0.0);
  h = r * 0.45 + saw * 0.35 + peb.x * 0.08 - crack * 0.10;
  a = 0.50 + sin(3.14159265 * ph) * 0.08 + (peb.y - 0.5) * 0.10 * step(0.01, peb.x)
    + fbm(uv, ivec2(24), 3, 109u) * 0.10 - crack * 0.14;
}
#endif

#if LAYER == 8
void lMarsh(vec2 uv, out float h, out float a) {
  float pool = smoothstep(0.10, 0.17, fbm(uv, ivec2(7), 5, 111u));
  float reed = fbm(uv, ivec2(160, 48), 2, 113u);
  vec2 clump = crowns(uv, 70, 115u, 0.45, 0.30, 0.60, 1.0);
  h = (1.0 - pool) * (0.30 + reed * 0.10 + clump.x * 0.35);
  a = mix(0.54 + reed * 0.16 - clump.x * 0.08, 0.24, pool);
}
#endif

#if LAYER == 9
void lBeach(vec2 uv, out float h, out float a) {
  float w = fbm(uv, ivec2(4), 3, 121u);
  float rip = sin(6.2831853 * (uv.x * 48.0 + uv.y * 20.0 + w * 6.0)) * 0.5 + 0.5;
  h = 0.40 + rip * 0.05 + fbm(uv, ivec2(12), 4, 123u) * 0.12;
  a = 0.50 + fbm(uv, ivec2(20), 4, 125u) * 0.10 + gnoise(uv * 256.0, ivec2(256), 127u) * 0.05;
}
#endif

/**
 * TARLA: blok başına 2-5 şerit (Avrupa tarla deseni), bazı şeritler enine
 * bölünür. Parsel başına ürün tonu; sürüm izi şerit boyunca. Çit yalnız bazı
 * BLOK kenarlarında ve tek tek ağaçtan: çizgi ağı gibi değil, ağaç sırası gibi.
 */
#if LAYER == 10
void lFields(vec2 uv, out float h, out float a) {
  vec2 q = uv + vec2(fbm(uv, ivec2(4), 3, 131u), fbm(uv, ivec2(4), 3, 133u)) * 0.018;
  const int N = 7;
  vec2 p = q * float(N);
  // Tuğla kaydırması: her blok satırı kendi payıyla kayar; dikey sınırlar
  // satırdan satıra hizalanmaz (orta zoomda kareli kâğıt gibi okunuyordu).
  p.x += hash1(ivec2(0, int(floor(p.y))), ivec2(1, N), 147u);
  vec2 ip = floor(p);
  vec2 f = p - ip;
  ivec2 c = ivec2(ip);
  vec4 r = hash4(c, ivec2(N), 137u);
  bool alongX = r.x < 0.5;
  float k = floor(2.0 + r.y * 4.0);
  float ax = alongX ? f.x : f.y;
  float si = floor(ax * k);
  float sf = fract(ax * k);
  vec4 rs = hash4(c * 8 + ivec2(int(si), 0), ivec2(N * 8), 139u);
  float cut = rs.y < 0.4 ? floor((alongX ? f.y : f.x) * 2.0) : 0.0;
  vec4 rp = hash4(c * 16 + ivec2(int(si) * 2 + int(cut), 1), ivec2(N * 16), 141u);
  float crop = rp.z;
  float baseA = crop < 0.22 ? 0.30 : crop < 0.48 ? 0.46 : crop < 0.74 ? 0.62 : 0.78;
  float eb = min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y));
  float es = min(sf, 1.0 - sf) / k;
  float tree = crowns(uv, 150, 143u, 0.80, 0.45, 0.80, 0.0).x;
  float hedge = (1.0 - smoothstep(0.022, 0.045, eb)) * step(0.45, r.z);
  float seam = 1.0 - smoothstep(0.004, 0.014, es);
  float fur = sin(6.2831853 * (alongX ? uv.x : uv.y) * 168.0) * 0.5 + 0.5;
  float plough = crop < 0.22 ? 1.0 : (crop > 0.74 ? 0.55 : 0.30);
  float hedgeT = hedge * smoothstep(0.05, 0.35, tree);
  h = 0.30 + (fur - 0.5) * 0.06 * plough + hedgeT * 0.70;
  a = baseA + (fur - 0.5) * 0.08 * plough + fbm(uv, ivec2(30), 2, 145u) * 0.04;
  a *= 1.0 - seam * 0.12;
  a = mix(a, 0.30, hedgeT);
}
#endif

/**
 * KASABA: sokak ızgarası; blok kenarında ev sırası, ortası avlu (koyu bahçe).
 * Ev çatısının sırtı sokağa paralel. Yerleşim izi shader'da province
 * merkezine bağlanır; doku yalnız malzemedir.
 */
#if LAYER == 11
void lUrban(vec2 uv, out float h, out float a) {
  const int N = 26;
  // Bükülmüş ızgara: sokaklar kıvrılır, kasaba piksel ızgarası gibi durmaz.
  vec2 q = uv + vec2(fbm(uv, ivec2(5), 2, 151u), fbm(uv, ivec2(5), 2, 153u)) * 0.012;
  vec2 p = q * float(N);
  vec2 ip = floor(p);
  vec2 f = p - ip;
  vec4 r = hash4(ivec2(ip), ivec2(N), 155u);
  float street = 0.16;
  vec2 bf = (f - street * 0.5) / (1.0 - street);
  float inB = step(0.0, bf.x) * step(bf.x, 1.0) * step(0.0, bf.y) * step(bf.y, 1.0);
  float dx = min(bf.x, 1.0 - bf.x);
  float dy = min(bf.y, 1.0 - bf.y);
  float edgeD = min(dx, dy);
  float ring = 1.0 - step(0.34, edgeD);
  float along = dx < dy ? bf.y : bf.x;
  float nH = floor(3.0 + r.y * 3.0);
  float hi = floor(along * nH);
  float hf = fract(along * nH);
  vec4 rh = hash4(ivec2(ip) * 8 + ivec2(int(hi), dx < dy ? 0 : 1), ivec2(N * 8), 157u);
  float gap = smoothstep(0.0, 0.08, hf) * smoothstep(1.0, 0.92, hf);
  float depth = edgeD / 0.34;
  float roof = 1.0 - abs(depth * 2.0 - 1.0);
  float house = inB * ring * gap * step(0.12, rh.x);
  h = house * (0.45 + roof * 0.55) * (0.8 + rh.y * 0.4);
  float yard = inB * (1.0 - ring);
  a = 0.48 + fbm(uv, ivec2(64), 2, 159u) * 0.04;
  a = mix(a, 0.34 + rh.w * 0.06, yard);
  a = mix(a, 0.42 + rh.z * 0.30, house);
}
#endif

void main() {
  vec2 uv = gl_FragCoord.xy / uSize;
  float h, a;
  LAYER_FN(uv, h, a);
  oCol = vec4(clamp(a, 0.0, 1.0), clamp(h, 0.0, 1.0), 0.0, 1.0);
}`;

/**
 * İKİNCİ GEÇİŞ: eğim ve düşen gölge, birinci geçişin (albedo, yükseklik)
 * çıktısından. Ayrı geçiş olmasının nedeni derleme süresi: katman işlevini
 * eğim ve gölge için altı kez çağıran tek program ANGLE/D3D derleyicisinde
 * 45 saniye sürdü (ölçüldü); katman başına tek çağrılı küçük programlar +
 * bu basit geçiş toplamda bunun küçük bir kesridir.
 */
const FS_POST = `#version 300 es
precision highp float;
precision highp int;
out vec4 oCol;
uniform highp sampler2D uSrc;
uniform int uN;
ivec2 wr(ivec2 q) { return (q % uN + uN) % uN; }
float hAt(vec2 q) {
  vec2 f = floor(q);
  vec2 t = q - f;
  ivec2 i = ivec2(f);
  float a = texelFetch(uSrc, wr(i), 0).g;
  float b = texelFetch(uSrc, wr(i + ivec2(1, 0)), 0).g;
  float c = texelFetch(uSrc, wr(i + ivec2(0, 1)), 0).g;
  float d = texelFetch(uSrc, wr(i + ivec2(1, 1)), 0).g;
  return mix(mix(a, b, t.x), mix(c, d, t.x), t.y);
}
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  vec4 c = texelFetch(uSrc, p, 0);
  float h = c.g;
  float hx = texelFetch(uSrc, wr(p + ivec2(1, 0)), 0).g;
  float hy = texelFetch(uSrc, wr(p + ivec2(0, 1)), 0).g;
  // DÜŞEN GÖLGE: güneş sabit (Ldir, denizle ortak), yani gölge albedoya
  // pişirilebilir. Işığa doğru üç adım; yükseklik birimi ~6 teksel boy,
  // güneş açısı tan ≈ 0.55. Mip'te ortalamaya karışır, shader oranı ortalamayla
  // böldüğü için harita kararmaz — yalnız ağaç/ev/çit kabarık okunur.
  vec2 Ld = normalize(vec2(-0.55, -0.68));
  float occ = 0.0;
  for (int i = 1; i <= 3; i++) {
    float d = float(i) * 2.0;
    occ = max(occ, (hAt(vec2(p) + Ld * d) - h) * 6.0 - d * 0.55);
  }
  float a = c.r * (1.0 - 0.42 * smoothstep(0.0, 1.5, occ));
  vec2 g = vec2(hx - h, hy - h) * ${GRAD_SCALE.toFixed(1)};
  oCol = vec4(clamp(a, 0.0, 1.0), h, clamp(0.5 + g, 0.0, 1.0));
}`;

function compile(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  return sh;
}

/**
 * Programlar önce HEPSİ başlatılır, durum sonra sorulur: sürücü (ANGLE)
 * derlemeyi iş parçacıklarına dağıtabilsin. Her programın durumunu hemen
 * sormak derlemeleri sıraya diziyordu.
 */
function linkAll(gl, vs, sources) {
  const out = sources.map((src) => {
    const prog = gl.createProgram();
    const fs = compile(gl, gl.FRAGMENT_SHADER, src);
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    return { prog, fs };
  });
  let err = null;
  for (const { prog, fs } of out) {
    if (!err && !gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      err = new Error('vic3 doku üreteci: ' + (gl.getShaderInfoLog(fs) || gl.getProgramInfoLog(prog)));
    }
    gl.deleteShader(fs);
  }
  if (err) {
    for (const { prog } of out) gl.deleteProgram(prog);
    throw err;
  }
  return out.map((o) => o.prog);
}

const LAYER_FN = ['lForest', 'lJungle', 'lGrass', 'lSteppe', 'lDesert', 'lTundra', 'lSnow',
  'lRock', 'lMarsh', 'lBeach', 'lFields', 'lUrban'];

/**
 * Dizi dokuyu üretir. Çağıran SurfaceGL'in çizim akışının ortasındadır
 * (bindGfx içinden): program, VAO, çerçeve tamponu, görüntü alanı ve etkin
 * doku birimi eski hâline döndürülür, yoksa ana çizimin uniformları bu
 * programa yazılırdı.
 * @returns {{tex: WebGLTexture, means: Float32Array, compileMs: number}} means: katman başına albedo ortalaması
 */
export function buildVicTextures(gl, unit) {
  const prev = {
    prog: gl.getParameter(gl.CURRENT_PROGRAM),
    vao: gl.getParameter(gl.VERTEX_ARRAY_BINDING),
    fb: gl.getParameter(gl.FRAMEBUFFER_BINDING),
    vp: gl.getParameter(gl.VIEWPORT),
    active: gl.getParameter(gl.ACTIVE_TEXTURE),
    tex2d: null,
  };
  const size = VIC_TEX_SIZE;
  const n = VIC_LAYERS.length;
  const levels = Math.log2(size) + 1;
  const t0 = performance.now();
  const vs = compile(gl, gl.VERTEX_SHADER, VS);
  const progs = [];
  let post = null;
  const means = new Float32Array(n).fill(0.5);
  const tex = gl.createTexture();
  const tmp = gl.createTexture();
  const fb = gl.createFramebuffer();
  const vao = gl.createVertexArray();
  let compileMs = 0;
  gl.activeTexture(gl.TEXTURE0 + unit);
  prev.tex2d = gl.getParameter(gl.TEXTURE_BINDING_2D);
  try {
    const sources = LAYER_FN.map((fn, k) =>
      FS.replace('#version 300 es\n', `#version 300 es\n#define LAYER ${k}\n#define LAYER_FN ${fn}\n`));
    sources.push(FS_POST);
    progs.push(...linkAll(gl, vs, sources));
    post = progs.pop();
    compileMs = performance.now() - t0;
    // Ara doku: yükseklik 8 bitte eğime basamak verirdi (kumul yamacı teksel
    // başına ~2 seviye); yarım kayan noktaya çizilebiliyorsa o kullanılır.
    const half = !!gl.getExtension('EXT_color_buffer_float');
    gl.bindTexture(gl.TEXTURE_2D, tmp);
    gl.texStorage2D(gl.TEXTURE_2D, 1, half ? gl.RGBA16F : gl.RGBA8, size, size);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, tex);
    gl.texStorage3D(gl.TEXTURE_2D_ARRAY, levels, gl.RGBA8, size, size, n);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.bindVertexArray(vao);
    gl.viewport(0, 0, size, size);
    for (let k = 0; k < n; k++) {
      // Ara dokuya yazarken birimden çözülür: okuma/yazma döngüsü olmasın.
      gl.bindTexture(gl.TEXTURE_2D, null);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tmp, 0);
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
        throw new Error('vic3 doku üreteci: ara çerçeve tamponu eksik');
      }
      gl.useProgram(progs[k]);
      gl.uniform1f(gl.getUniformLocation(progs[k], 'uSize'), size);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, tex, 0, k);
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
        throw new Error('vic3 doku üreteci: çerçeve tamponu eksik');
      }
      gl.useProgram(post);
      gl.bindTexture(gl.TEXTURE_2D, tmp);
      gl.uniform1i(gl.getUniformLocation(post, 'uSrc'), unit);
      gl.uniform1i(gl.getUniformLocation(post, 'uN'), size);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, tex);
    gl.generateMipmap(gl.TEXTURE_2D_ARRAY);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.REPEAT);
    // En küçük mip (1x1) katmanın kutu ortalaması: albedo oranla kullanılır,
    // ortalama 1'e oturur ve doku haritanın parlaklığını kaydırmaz.
    const px = new Uint8Array(4);
    for (let k = 0; k < n; k++) {
      gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, tex, levels - 1, k);
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) continue;
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      means[k] = Math.max(0.05, px[0] / 255);
    }
  } catch (err) {
    gl.deleteTexture(tex);
    throw err;
  } finally {
    gl.bindFramebuffer(gl.FRAMEBUFFER, prev.fb);
    gl.deleteFramebuffer(fb);
    gl.bindVertexArray(prev.vao);
    gl.deleteVertexArray(vao);
    gl.useProgram(prev.prog);
    for (const pr of progs) gl.deleteProgram(pr);
    if (post) gl.deleteProgram(post);
    gl.deleteShader(vs);
    gl.deleteTexture(tmp);
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, prev.tex2d);
    gl.viewport(prev.vp[0], prev.vp[1], prev.vp[2], prev.vp[3]);
    gl.activeTexture(prev.active);
  }
  return { tex, means, compileMs };
}
