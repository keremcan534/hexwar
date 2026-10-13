// GÖRSEL STİL ORTAK GLSL PARÇASI — yalnız klasik dışı stil programlarına girer.
//
// SurfaceGL bir stil etkinleşince FRAG'ı yeniden derler: başa `#define GFX 1`,
// landColor'dan hemen önceye bu parça + stilin kendi GLSL'i. Klasik program bu
// parçayı HİÇ görmez; klasik yolun pikselleri bu yüzden birebir aynı kalır.
//
// Buradaki her yardımcı üç kurala uyar:
//   1. Doku okuması `textureLod` ile, LOD analitik: landColor dallanan akışın
//      (kıyı AA bandında iki kez, deniz/kara dalı) içinde çağrılır ve orada
//      türev (dFdx) tanımsızdır; mip seçimi kıyıda kıvılcım yapardı. Piksel
//      dünyası tektir (ortografik), LOD formülle bilinir.
//   2. Gürültü PERİYODİK: kafes x'te dünya enine tam sayı hücreyle sarılır.
//      Ham dünya koordinatlı gürültü sarmal dikişinde sıçrıyordu (klasik
//      pigment hatası, bkz. understand-synth §1).
//   3. Işık ortalamayı korur: gölge eğimin ışık yönündeki DOĞRUSAL bileşeni,
//      düz zeminde tam 1.0. Sınırlı bir eğri ortalamayı kaydırmaz, haritayı
//      karartmaz (Kerem kuralı: "haritayı karartma").
//
// Birimler: dünya birimi (hex eni 45.03, satır 39). Yükseklik birimi
// terrainBake'in normalize yüksekliği (kıyı 0, zirve ~1). uHeightScale
// yükseklik birimini dünya birimine çevirir; eğimin ışığa giden tek kaldıracı.
//
// DİZİN (imzalar aşağıda):
//   koordinat  gfxUV(world) gfxWrap(world) gfxPx() gfxLod(step, texel)
//   LOD        gfxDetail() gfxZoomFade(z0, z1) gfxScreenFade(worldPeriod)
//   gürültü    gfxHashU(uvec3) gfxHash(vec2, salt) gfxNoise(world, cell, salt) gfxFbm(world, cell, oct, salt)
//   yükseklik  gfxTerrain(world) → (h, taban, kapı, kıyı) gfxTerrainLod gfxHeight gfxBaseHeight
//              gfxHighland gfxCoastDist gfxHeightGrad(world, s) gfxHeightGradMS(world, px)
//              gfxHeightNormal(world, px, exag) gfxNormalFromGrad(g, exag) gfxSlope(N)
//              gfxErosionGrad(world, g, kapı, amp) gfxGully(...)
//   ışık       gfxHillshade(N, L, k, lo, hi)  — düzde 1.0, ortalama korunur
//   biyom      gfxBiomeAt(world) → GfxBiome gfxBiomeLod gfxBiomeWeights(world, a, b, c) gfxClimate(world)
//   hex verisi gfxHexData(cell) gfxDev(cell) → GfxDev
//   renk       gfxLuma(c) gfxWithLuma(c, l) gfxClassicMaterial(L) gfxClassicGrade(c)
//
// Kar/buz notu: biyomun `snow` kanalı kutup buzunu (ICE) da taşır. Dağ karı
// için snow × gfxHighland, kutup buzu için snow × (1 − gfxHighland).

export const TERRAIN_GLSL = `
// ===== GFX ORTAK (src/render/gfx/terrainGLSL.js) =====
uniform highp sampler2D uTerrH;        // birim 11 — RGBA16F: R yükseklik, G taban, B yayla kapısı, A kıyı uzaklığı (hex, kara +)
uniform highp sampler2DArray uBiome;   // birim 12 — RGBA8 x3: [orman cangıl çayır bozkır] [çöl tundra kar kaya] [bataklık kumsal sıcaklık nem]
uniform highp sampler2D uGfxHex;       // birim 13 — stilin hex başına verisi (RGBA8, NEAREST; yoksa boş)
uniform float uGfxHexOn;               // 1 = uGfxHex dolu
uniform vec2 uTerrTexel;               // yükseklik tekselinin dünya en/boyu
uniform vec2 uBiomeTexel;              // biyom tekselinin dünya en/boyu
uniform float uHeightScale;            // 1 yükseklik birimi kaç dünya birimi (ışık eğimi)

/** Stilin landColor girdisi. */
struct GfxLand {
  vec2 world;   // açılmış dünya koordinatı (ekranda sürekli; gürültüye DOĞRUDAN verme, gfxWrap)
  vec2 wp;      // sarmala indirgenmiş dünya [x0, x0 + en)
  vec2 uv;      // alan uv'si (x REPEAT, y kenetli)
  vec2 cell;    // pikselin hexi (kolon, satır; sarmala indirgenmiş)
  vec2 raw;     // hexAt ham çıktısı (sarmalsız)
  vec2 fill;    // dolgu hücresi (organik sınır; sahiplik ve renk buradan)
  vec3 base;    // oyunun hex rengi (uOwner, bölge içinde süzülmüş), klasik gölgeden ÖNCE
  vec4 ch;      // arazi karakteri (R kabartma/2, G gren, B sıcaklık*0.5+0.5)
  vec3 Ldir;    // ışık yönü (deniz ile ORTAK)
  float damp;   // 1 malzemeli kip, 0.28 veri kipi: her yeni terim bununla çarpılmalı
  float px;     // bir GL pikselinin dünya boyu
  float region; // dolgu hücresinin bölge kimliği (0 = deniz)
  float owned;  // 1 = bölge sahipli (uRegion.b)
};

struct GfxBiome {
  float forest; float jungle; float grass; float steppe; float desert;
  float tundra; float snow; float rock; float marsh; float beach;
  float temperature; float moisture;
};

vec2 gfxUV(vec2 world) { return (world - uFieldOrigin) / uFieldSpan; }
vec2 gfxWrap(vec2 world) {
  return vec2(uFieldOrigin.x + mod(world.x - uFieldOrigin.x, uFieldSpan.x), world.y);
}
/** Bir GL pikselinin dünya boyu (uDpr çözünürlük ölçeğini içerir). */
float gfxPx() { return 1.0 / (uZoom * uDpr); }
/** Adım boyu teksel boyunun kaç katıysa o mip. */
float gfxLod(float stepWorld, float texelWorld) { return max(0.0, log2(stepWorld / texelWorld)); }

// ---- LOD ----
/** Denizin de kullandığı yakınlık: (zoom − 0.35) / 1.1, 0..1 (z0.35 → 0, z1.45 → 1). */
float gfxDetail() { return uDetail; }
/** Zoom aralığında 0→1 (ör. yakın ayrıntıyı z0..z1 arasında aç). */
float gfxZoomFade(float z0, float z1) { return smoothstep(z0, z1, uZoom); }
/** Dünya periyodu ekranda 2-6 pikselin altına inen desen söner (aliasing yerine ton). */
float gfxScreenFade(float worldPeriod) { return smoothstep(2.0, 6.0, worldPeriod / gfxPx()); }

// ---- periyodik gürültü ----
uint gfxHashU(uvec3 v) {
  v = v * 1664525u + 1013904223u;
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
  v ^= v >> 16u;
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
  return v.x ^ v.y ^ v.z;
}
float gfxHash(vec2 i, float salt) {
  return float(gfxHashU(uvec3(uvec2(ivec2(i)), uint(salt)))) * (1.0 / 4294967295.0);
}
/**
 * Periyodik değer gürültüsü, 0..1. cellWorld istenen hücre boyu; gerçek boy
 * dünya enini tam sayıya bölen en yakın değerdir, böylece sarmalda dikiş yok.
 */
float gfxNoise(vec2 world, float cellWorld, float salt) {
  float nc = max(1.0, floor(uFieldSpan.x / cellWorld + 0.5));
  float cw = uFieldSpan.x / nc;
  vec2 p = (gfxWrap(world) - uFieldOrigin) / cw;
  vec2 i = floor(p);
  vec2 f = p - i;
  f = f * f * (3.0 - 2.0 * f);
  float x0 = mod(i.x, nc);
  float x1 = mod(i.x + 1.0, nc);
  float a = gfxHash(vec2(x0, i.y), salt);
  float b = gfxHash(vec2(x1, i.y), salt);
  float c = gfxHash(vec2(x0, i.y + 1.0), salt);
  float d = gfxHash(vec2(x1, i.y + 1.0), salt);
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
/** Periyodik fBm (oktav başına hücre yarıya iner), 0..1. Aşırı ince oktavı kendisi söndürür. */
float gfxFbm(vec2 world, float cellWorld, int octaves, float salt) {
  float sum = 0.0;
  float amp = 0.5;
  float norm = 0.0;
  float cw = cellWorld;
  for (int k = 0; k < 6; k++) {
    if (k >= octaves) break;
    float fade = gfxScreenFade(cw);
    sum += (gfxNoise(world, cw, salt + float(k) * 17.0) - 0.5) * amp * fade;
    norm += amp;
    amp *= 0.5;
    cw *= 0.5;
  }
  return 0.5 + sum / max(norm, 1e-4);
}

// ---- yükseklik ----
vec4 gfxTerrainLod(vec2 world, float lod) { return textureLod(uTerrH, gfxUV(world), lod); }
/** Piksel boyuna uygun mipten tam kayıt (R h, G taban, B kapı, A kıyı). */
vec4 gfxTerrain(vec2 world) { return gfxTerrainLod(world, gfxLod(gfxPx(), uTerrTexel.x)); }
float gfxHeight(vec2 world) { return gfxTerrain(world).r; }
float gfxBaseHeight(vec2 world) { return gfxTerrain(world).g; }
float gfxHighland(vec2 world) { return gfxTerrain(world).b; }
/** Yumuşak kıyıya işaretli uzaklık, hex eni cinsinden (kara +, deniz −). */
float gfxCoastDist(vec2 world) { return gfxTerrain(world).a; }

/** Merkezi fark, adım s dünya birimi; dönüş yükseklik birimi / dünya birimi. */
vec2 gfxHeightGrad(vec2 world, float s) {
  float lod = gfxLod(s, uTerrTexel.x);
  vec2 uv = gfxUV(world);
  vec2 ox = vec2(s / uFieldSpan.x, 0.0);
  vec2 oy = vec2(0.0, s / uFieldSpan.y);
  float l = textureLod(uTerrH, uv - ox, lod).r;
  float r = textureLod(uTerrH, uv + ox, lod).r;
  float u = textureLod(uTerrH, uv - oy, lod).r;
  float d = textureLod(uTerrH, uv + oy, lod).r;
  return vec2(r - l, d - u) / (2.0 * s);
}

/**
 * Çok ölçekli yüzey normali. İnce ölçek pikselden ya da tekselden hangisi
 * büyükse odur (uzakta alt-piksel eğim kumlanmasın); geniş ölçek 2.5 katı ve
 * kütleyi taşır. exag stilin abartısı (1 = uHeightScale).
 */
vec3 gfxHeightNormal(vec2 world, float pixelWorld, float exag) {
  float s = max(uTerrTexel.x, pixelWorld * 1.5);
  vec2 g = gfxHeightGrad(world, s) * 0.65 + gfxHeightGrad(world, s * 2.5) * 0.35;
  return normalize(vec3(-g * uHeightScale * exag, 1.0));
}

/** Çok ölçekli eğim (gfxHeightNormal'ın kendisi, normal kurmadan): yükseklik birimi / dünya birimi. */
vec2 gfxHeightGradMS(vec2 world, float pixelWorld) {
  float s = max(uTerrTexel.x, pixelWorld * 1.5);
  return gfxHeightGrad(world, s) * 0.65 + gfxHeightGrad(world, s * 2.5) * 0.35;
}
/** Eğimden normal; exag stilin abartısı. */
vec3 gfxNormalFromGrad(vec2 g, float exag) { return normalize(vec3(-g * uHeightScale * exag, 1.0)); }

/** Eğim (tan açı) — kaya/kar eşikleri için; exag ışıktakiyle aynı olmalı. */
float gfxSlope(vec3 N) { return length(N.xy) / max(N.z, 1e-3); }

/**
 * YAMAÇ OLUĞU FAZÖRÜ (terrainBake.gullies ile aynı kural): hücre başına
 * rastgele fazlı şeritler dir yönüne paralel uzanır, komşu hücreler
 * yumuşakça karışır. Dönüş: x = desen (−1..1), yz = dünya birimi başına
 * türev (ağırlık türevi ihmal: yumuşak).
 */
vec3 gfxGully(vec2 world, vec2 dir, float cellWorld, float waveWorld, float salt) {
  float nc = max(1.0, floor(uFieldSpan.x / cellWorld + 0.5));
  float cw = uFieldSpan.x / nc;
  vec2 p = (gfxWrap(world) - uFieldOrigin) / cw;
  vec2 ip = floor(p);
  vec2 perp = vec2(-dir.y, dir.x);
  float k = 6.2831853 / waveWorld;
  float sig = 1.0 / (0.55 * cw * cw);
  float sc = 0.0;
  float sw = 0.0;
  vec2 ds = vec2(0.0);
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 c = ip + vec2(float(i), float(j));
      uint h = gfxHashU(uvec3(uint(mod(c.x, nc)), uint(c.y + 4096.0), uint(salt)));
      vec2 jit = vec2(float(h & 255u), float((h >> 8u) & 255u)) / 255.0 - 0.5;
      vec2 q = (c + 0.5 + jit * 0.7 - p) * cw;
      float w = exp(-dot(q, q) * sig);
      float ph = -dot(q, perp) * k + float((h >> 16u) & 1023u) * (6.2831853 / 1024.0);
      sc += w * cos(ph);
      ds -= w * sin(ph) * perp * k;
      sw += w;
    }
  }
  float inv = 1.0 / (sw + 1e-6);
  return vec3(sc * inv, ds * inv);
}

/**
 * YAKIN ZOOM DAĞ AYRINTISI. Pişmiş yükseklik yakında ~20 pikselde bir teksel
 * kalır ve sırtlar yumuşar; burada iki oktav oluk piksel başına kurulur ve
 * EĞİME eklenir (yükseklik dokusu değişmez). İkinci oktavın yönü taban eğimi
 * ARTI ilk oktavın oyduğu eğimdir: ince oluk mahmuzun yanından iner, ağaç
 * dalı gibi (dendritik) okunur — iki oktav aynı yöne baktığında desen
 * merkezden saçılan "taç yaprağı" gibi duruyordu. Kapı yayla kapısı × taban
 * eğimi; ekranda 6 pikselin altına inen oktav söner.
 *   base: gfxHeightGradMS çıktısı; gate: yayla kapısı (gfxTerrain().b);
 *   amp: pişmiş birimde genlik (~0.02; 0 kapatır).
 * Dönüş: eklenecek eğim (yükseklik birimi / dünya birimi).
 */
vec2 gfxErosionGrad(vec2 world, vec2 base, float gate, float amp) {
  float hexW = uHexSize * 1.7320508;
  float gm = length(base) * hexW;
  float w = gate * smoothstep(0.03, 0.20, gm);
  if (w < 0.01 || amp <= 0.0) return vec2(0.0);
  vec2 acc = base;
  vec2 g = vec2(0.0);
  float wave = hexW * 0.55;
  float a = amp;
  float px = gfxPx();
  for (int o = 0; o < 2; o++) {
    float fade = gfxScreenFade(wave * 0.5);
    // Sonraki oktav daha ince: bu sönmüşse o da sönük.
    if (fade <= 0.0) break;
    vec2 dir = acc / max(length(acc), 1e-6);
    vec3 gg = gfxGully(world, dir, wave * 1.1, wave, 71.0 + float(o) * 13.0);
    // Keskin sırt, V vadi: 0.5 − |g| kıvrımı. |g| yumuşak (√(g²+e²)), e bir
    // pikseldeki değişim kadar: kıvrım ekran pikseline basamaklanmasın.
    float e = max(0.10, length(gg.yz) * px * 1.5);
    float s = gg.x * inversesqrt(gg.x * gg.x + e * e);
    vec2 d = -s * gg.yz * a * fade;
    g += d;
    acc += d * w;
    wave *= 0.5;
    a *= 0.5;
  }
  return g * w;
}

/**
 * ORTALAMAYI KORUYAN, SINIRLI tepe gölgesi. Düz zeminde tam 1.0; eğimin ışık
 * yönündeki doğrusal bileşeni k ile ölçeklenir ve tanh ile [lo, hi] içine
 * yumuşakça sıkıştırılır. Doğrusal terimin alan ortalaması kapalı bir
 * yüzeyde sıfırdır: harita bütünde kararmaz, yalnız yerel kontrast kazanır.
 * lo/hi bakışımsızsa küçük bir kayma olur; Kerem'in kabul ettiği aralık
 * 0.88..1.28 civarıydı (9ceebae).
 */
float gfxHillshade(vec3 N, vec3 L, float k, float lo, float hi) {
  float s = dot(N.xy / max(N.z, 1e-3), L.xy) / L.z * k;
  float up = max(hi - 1.0, 1e-3);
  float dn = max(1.0 - lo, 1e-3);
  return 1.0 + (s > 0.0 ? up * tanh(s / up) : dn * tanh(s / dn));
}

// ---- biyom ve iklim ----
GfxBiome gfxBiomeLod(vec2 world, float lod) {
  vec2 uv = gfxUV(world);
  vec4 a = textureLod(uBiome, vec3(uv, 0.0), lod);
  vec4 b = textureLod(uBiome, vec3(uv, 1.0), lod);
  vec4 c = textureLod(uBiome, vec3(uv, 2.0), lod);
  return GfxBiome(a.r, a.g, a.b, a.a, b.r, b.g, b.b, b.a, c.r, c.g, c.b, c.a);
}
GfxBiome gfxBiomeAt(vec2 world) { return gfxBiomeLod(world, gfxLod(gfxPx(), uBiomeTexel.x)); }
/** Ham katmanlar: a=[orman cangıl çayır bozkır] b=[çöl tundra kar kaya] c=[bataklık kumsal sıcaklık nem]. */
void gfxBiomeWeights(vec2 world, out vec4 a, out vec4 b, out vec4 c) {
  vec2 uv = gfxUV(world);
  float lod = gfxLod(gfxPx(), uBiomeTexel.x);
  a = textureLod(uBiome, vec3(uv, 0.0), lod);
  b = textureLod(uBiome, vec3(uv, 1.0), lod);
  c = textureLod(uBiome, vec3(uv, 2.0), lod);
}
/** (sıcaklık, nem), 0..1, hex merkezlerinden süzülmüş. */
vec2 gfxClimate(vec2 world) {
  return textureLod(uBiome, vec3(gfxUV(world), 2.0), gfxLod(gfxPx(), uBiomeTexel.x)).ba;
}

// ---- stilin hex başına verisi (gelişmişlik, nüfus...) ----
/** Stilin hexData() çıktısı, ham RGBA (0..1); veri yoksa 0. Sahiplik gibi L.fill ile oku. */
vec4 gfxHexData(vec2 cell) { return uGfxHexOn > 0.5 ? texelFetch(uGfxHex, ivec2(cell), 0) : vec4(0.0); }

/** gfx/devData.js devHexData kodlaması (stilin hexData'sı o ise). */
struct GfxDev {
  float development; // 0..1 (kalkınma / 10)
  float density;     // 0..1, 0.5 = dünya medyanı, ±0.25 = ±1 oktav
  float industry;    // 0..1 (fabrika kademesi / 5)
  float farm;        // 0..1 (tarla kademesi / 3)
  float rail;        // 0/1 demiryolu
  float centre;      // 0/1 province merkezi hexi
};
GfxDev gfxDev(vec2 cell) {
  vec4 v = gfxHexData(cell);
  float a = floor(v.a * 255.0 + 0.5);
  GfxDev d;
  d.development = v.r;
  d.density = v.g;
  d.industry = v.b;
  d.centre = step(128.0, a);
  a -= d.centre * 128.0;
  d.rail = step(64.0, a);
  a -= d.rail * 64.0;
  d.farm = floor(a / 16.0 + 0.001) / 3.0;
  return d;
}

// ---- renk ----
float gfxLuma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
/** Rengin tonunu/doygunluğunu koruyup parlaklığını l'ye taşır (ülke rengi + arazi ışığı). */
vec3 gfxWithLuma(vec3 c, float l) { return clamp(c * (l / max(gfxLuma(c), 1e-4)), 0.0, 1.0); }

/** Klasik malzeme (kabartma + pigment + sıcak/soğuk), stil kendi tabanı olarak isterse. */
vec3 gfxClassicMaterial(GfxLand L) {
  float reliefGain = L.ch.r * 2.0;
  float grainAmt = L.ch.g;
  float warmth = (L.ch.b - 0.5) * 2.0;
  float h;
  vec2 g = elevGrad(L.uv, h);
  vec3 N = normalize(vec3(g * uLandRelief * reliefGain * 18.0, 1.0));
  float shade = pow(clamp(dot(N, L.Ldir) * 0.5 + 0.5, 0.0, 1.0), 1.35);
  float pg = pigmentNoise(L.world * 0.0055) - 0.5;
  float pf = pigmentNoise(L.world * 0.031) - 0.5;
  float pm = pigmentNoise(L.world * 0.11) - 0.5;
  float pig = pg * 0.55 + pf * 0.30 + pm * grainAmt * 0.55;
  vec3 col = L.base;
  col *= mix(1.0, shade * 1.55, 0.72 * L.damp);
  col *= 1.0 + pig * uLandGrain * L.damp;
  float t = (shade - 0.5) * 2.0 + warmth * 0.35;
  col += vec3(0.028, 0.014, -0.020) * t * 0.55 * L.damp;
  return col;
}
/** Klasik küresel derece (S eğrisi, uGrade payı). */
vec3 gfxClassicGrade(vec3 col) { return mix(col, col * col * (3.0 - 2.0 * col), uGrade); }

GfxLand gfxLandInput(vec2 world, vec2 cell, vec2 raw, vec2 fill, vec3 base, vec4 ch, vec3 Ldir) {
  GfxLand L;
  L.world = world;
  L.wp = gfxWrap(world);
  L.uv = gfxUV(world);
  L.cell = cell;
  L.raw = raw;
  L.fill = fill;
  L.base = base;
  L.ch = ch;
  L.Ldir = Ldir;
  L.damp = mix(1.0, 0.28, uDataMode);
  L.px = gfxPx();
  L.region = regionAt(fill);
  L.owned = texelFetch(uRegion, ivec2(fill), 0).b;
  return L;
}
// ===== GFX ORTAK SONU =====
`;
