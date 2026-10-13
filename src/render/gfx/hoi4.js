// HOI4 SANAT YÖNÜ (?gfx=hoi4) — Hearts of Iron IV haritası.
//
// vic3'ten farkı yöntemde, renkte değil:
//   - Siyasi kipte ülke rengi arazinin ÜSTÜNE yarı saydam bir örtüdür; arazi
//     kendi rengiyle (koyu orman, gri kaya, beyaz kar, kum) altından okunur.
//     vic3'te arazi yalnız parlaklık verir, ton ülkenindir. Komşuların her
//     zoomda ayrılması burada örtünün yüksek payı (≥ 0.5), ülke renginin
//     doygunluk artışı ve sınırın İÇİNDEKİ ince renk şeridiyle sağlanır.
//   - Sınır: koyu, keskin, ince ülke çizgisi + her iki yanda o ülkenin doygun
//     renginde birkaç piksellik şerit (HOI4 imzası). Şerit ekran pikselinde
//     sabit ve kenarı keskin: Kerem geniş yumuşak sınır bandını reddetti.
//     State sınırı daha ince, daha açık ve kesikli.
//   - Uzakta (z < ~0.42) stratejik "kâğıt" harita: düz ülke rengi + lif,
//     dokuma ve geniş leke; arazi hiç hesaplanmaz (gürültü yok, kare ucuz).
//     0.42 → 0.72 arasında araziye yumuşakça geçer.
//   - Arazi paleti soğuk ve kısık (askerî harita); ayrıntı dokuları vic3'ün
//     üreteciyle aynı dizi (vic3Textures.js), payları daha sert.
//
// Deniz bu stile kapalıdır (seaColor ortaktır). Veri kiplerinde (L.damp 0.28)
// yalnız hafif gölge: seçim yüzeyi.

import { registerGfxStyle } from './registry.js';
import { buildVicTextures, VIC_LAYERS, GRAD_SCALE } from './vic3Textures.js';
import { devHexData, devHexKey } from './devData.js';
import { BAND_REACH } from '../borderMesh.js';

const GLSL = `
#define GFX_CUSTOM_BAND 1
uniform highp sampler2DArray uHoiTex;   // birim 14 — ayrıntı dokuları (vic3Textures.js)
uniform float uHoiMode;      // 0 siyasi/kültür, 1 arazi/coğrafya, 2 veri/seçim
uniform vec4 uHoiMeanA;      // katman albedo ortalamaları 0-3
uniform vec4 uHoiMeanB;      // 4-7
uniform vec4 uHoiMeanC;      // 8-11
uniform vec2 uHoiTiles;      // ince / kaba döşemenin dünya enine sığma sayısı
uniform vec4 uHoiZoom;       // x kâğıt biter, y arazi tam, z doku başı, w doku sonu
uniform vec4 uHoiNear;       // x yakın başı, y yakın sonu, z örtü inişi başı, w örtü inişi sonu
uniform vec4 uHoiWash;       // x örtü (orta), y örtü (yakın), z ülke doygunluğu, w örtünün kabartma payı
uniform vec4 uHoiLight;      // siyasi: x kazanç, y alt, z üst, w doku eğimi
uniform vec4 uHoiLightT;     // arazi kipi: x kazanç, y alt, z üst, w doku payı
uniform vec4 uHoiFringe;     // x genişlik (CSS px), y güç, z doygunluk, w kıyıdaki payı
uniform vec4 uHoiPaper;      // x lif, y dokuma, z leke, w kâğıt rengi açması
uniform vec4 uHoiSnow;       // x eşik, y yumuşaklık, z sırt payı, w eğim payı
uniform vec4 uHoiRock;       // x eğim başı, y eğim sonu, z kaya payı, w erozyon
uniform vec4 uHoiFarm;       // x tarla payı, y eşik, z yama payı, w örtü altı parlaklık payı
uniform float uHoiLift;      // arazi kipi kazancı (ormanlık kadraj klasikten koyu kalmasın)

const float HOI_TEX = 512.0;
const float HOI_GS = ${GRAD_SCALE.toFixed(1)};
const float HOI_REACH = ${BAND_REACH.toFixed(1)};
const float HOI_LMID = 0.42;   // örtü altında arazi parlaklığının sıkıştığı orta
const float HOI_FRINGE_L = 0.90; // şeridin parlaklığı / ülke rengininki
const int HK_FOREST = 0;
const int HK_JUNGLE = 1;
const int HK_GRASS = 2;
const int HK_STEPPE = 3;
const int HK_DESERT = 4;
const int HK_TUNDRA = 5;
const int HK_SNOW = 6;
const int HK_ROCK = 7;
const int HK_MARSH = 8;
const int HK_BEACH = 9;
const int HK_FIELDS = 10;

// Askerî palet (gama): soğuk, kısık. Orman koyu mavimsi taç, kaya nötr gri,
// çöl soluk kum; hiçbiri vic3'ün sıcak iklim renkleri değil.
const vec3 HOI_PAL[12] = vec3[12](
  vec3(0.27, 0.34, 0.28),
  vec3(0.23, 0.34, 0.26),
  vec3(0.51, 0.56, 0.43),
  vec3(0.63, 0.61, 0.48),
  vec3(0.79, 0.72, 0.56),
  vec3(0.56, 0.58, 0.53),
  vec3(0.89, 0.91, 0.94),
  vec3(0.53, 0.53, 0.52),
  vec3(0.39, 0.44, 0.37),
  vec3(0.79, 0.76, 0.65),
  vec3(0.60, 0.59, 0.43),
  vec3(0.54, 0.53, 0.51)
);
// Doku genliği: orman ve kaya sert (taç ve kaya katmanı okunsun), çayır ve
// kumsal sakin (örtü altında benek gürültüsü olmasın).
const float HOI_TEXAMP[12] = float[12](1.30, 1.20, 0.70, 0.70, 0.90, 0.80, 0.60, 1.25, 0.90, 0.45, 1.0, 1.0);

float hoiMean(int k) {
  vec4 m = k < 4 ? uHoiMeanA : (k < 8 ? uHoiMeanB : uHoiMeanC);
  int c = k & 3;
  return c == 0 ? m.x : (c == 1 ? m.y : (c == 2 ? m.z : m.w));
}

vec3 hoiSat(vec3 c, float k) {
  float l = gfxLuma(c);
  return clamp(vec3(l) + (c - vec3(l)) * k, 0.0, 1.0);
}

struct HoiS { float a; float h; vec2 g; };

/**
 * İki ölçekli örnek (vic3 ile aynı kural): kaba döşeme 90° döndürülür, iki
 * tekrar ızgarası hizalanmaz; ikisi de dünya enini tam sayı kez böler. LOD
 * analitik (landColor dallı akışta türev yok).
 */
HoiS hoiSample(int layer, vec2 o, float px, float macroBias, float coarseW) {
  float tf = uFieldSpan.x / uHoiTiles.x;
  float tc = uFieldSpan.x / uHoiTiles.y;
  float lf = max(0.0, log2(px * HOI_TEX / tf));
  float lc = max(macroBias, log2(px * HOI_TEX / tc));
  vec4 f = textureLod(uHoiTex, vec3(o / tf, float(layer)), lf);
  vec4 c = textureLod(uHoiTex, vec3(o.yx / tc, float(layer)), lc);
  float m = hoiMean(layer);
  // Düzenli desenin (tarla, kumul) kaba kopyası yakında dev dikdörtgen okunur.
  if (layer >= HK_FIELDS || layer == HK_DESERT) coarseW *= 1.0 - smoothstep(0.0, 0.5, macroBias);
  HoiS s;
  s.a = m + (f.r - m) * 0.75 + (c.r - m) * 0.55 * coarseW;
  s.h = mix(f.g, f.g * 0.6 + c.g * 0.4, coarseW);
  s.g = (f.ba - 0.5) / HOI_GS + (c.ab - 0.5) / HOI_GS * 0.45 * coarseW;
  return s;
}

/** Tarla parseli: çit, sürülmüş toprak, yeşil ekin, haki, soluk buğday (yorgan). */
vec3 hoiFieldColor(float a) {
  vec3 c = mix(vec3(0.22, 0.27, 0.19), vec3(0.46, 0.40, 0.31), smoothstep(0.22, 0.30, a));
  c = mix(c, vec3(0.42, 0.50, 0.32), smoothstep(0.32, 0.46, a));
  c = mix(c, vec3(0.62, 0.61, 0.40), smoothstep(0.48, 0.62, a));
  c = mix(c, vec3(0.76, 0.71, 0.51), smoothstep(0.64, 0.78, a));
  return mix(HOI_PAL[HK_FIELDS], c, mix(0.35, 1.0, smoothstep(0.9, 2.2, uZoom)));
}

/**
 * Gelişmişlik verisinin (devData: R kalkınma, G yoğunluk) yumuşak okuması:
 * hexBlend'in komşu kuralı. Hex kimliğine bağlı tarla payı ızgarayı yeniden
 * çizerdi; burada province basamağı bir hex boyunca erir.
 */
vec2 hoiDev(GfxLand L) {
  if (uGfxHexOn < 0.5) return vec2(0.0, 0.5);
  float odd = mod(L.raw.y, 2.0);
  float stepX = SQ3 * uHexSize;
  vec2 p = L.world - vec2((L.raw.x + 0.5 * odd) * stepX, L.raw.y * 1.5 * uHexSize);
  vec2 acc = vec2(0.0);
  float ws = 0.0;
  for (int k = 0; k < 7; k++) {
    vec2 dc = vec2(0.0);
    vec2 off = vec2(0.0);
    if (k == 1) { dc = vec2(1.0, 0.0); off = vec2(stepX, 0.0); }
    else if (k == 2) { dc = vec2(-1.0, 0.0); off = vec2(-stepX, 0.0); }
    else if (k >= 3) {
      float dy = k < 5 ? -1.0 : 1.0;
      bool right = k == 3 || k == 5;
      dc = vec2(right ? odd : odd - 1.0, dy);
      off = vec2(right ? stepX * 0.5 : -stepX * 0.5, dy * 1.5 * uHexSize);
    }
    vec2 nc = L.cell + dc;
    if (nc.y < 0.0 || nc.y > uGrid.y - 1.0) continue;
    nc.x = mod(nc.x, uGrid.x);
    if (texelFetch(uHex, ivec2(nc), 0).r >= 0.5) continue;
    float x = clamp(1.0 - length(p - off) / stepX, 0.0, 1.0);
    float w = x * x * (3.0 - 2.0 * x);
    acc += gfxHexData(nc).rg * w;
    ws += w;
  }
  return ws > 1e-4 ? acc / ws : vec2(0.0, 0.5);
}

/**
 * Kâğıt dokusu, ortalaması 1: lif lekesi, ince dokuma, geniş leke. Dünyaya
 * bağlı ve periyodik (kaydırınca kâğıt da kayar, sarmalda dikiş yok);
 * ekranda 2-6 pikselin altına inen oktav kendiliğinden söner.
 */
float hoiPaperGrain(GfxLand L) {
  float fib = gfxFbm(L.world, 26.0, 3, 41.0) - 0.5;
  float stain = gfxFbm(L.world, 380.0, 2, 43.0) - 0.5;
  float nc = max(1.0, floor(uFieldSpan.x / 15.0 + 0.5));
  float per = uFieldSpan.x / nc;
  vec2 q = (L.wp - uFieldOrigin) * (6.2831853 / per);
  float weave = sin(q.x) * sin(q.y) * gfxScreenFade(per);
  return 1.0 + fib * uHoiPaper.x + weave * uHoiPaper.y + stain * uHoiPaper.z;
}

vec3 gfxLand(GfxLand L) {
  vec3 country = hoiSat(L.base, uHoiWash.z);
  float paper = uHoiMode < 0.5 ? 1.0 - smoothstep(uHoiZoom.x, uHoiZoom.y, uZoom) : 0.0;
  vec3 paperCol = paper > 0.0 ? country * uHoiPaper.w * hoiPaperGrain(L) : vec3(0.0);
  // Kâğıt haritada arazi hiç hesaplanmaz: hem "uzakta arazi gürültüsü yok"
  // hem uzak kare bütçesi (< 2 ms).
  if (paper > 0.999) return paperCol;

  float hexW = uHexSize * 1.7320508;
  vec2 g = gfxHeightGradMS(L.world, L.px);
  if (uHoiMode > 1.5) {
    // Veri kipi: seçim yüzeyi; yalnız kısık kabartma.
    float hd = gfxHillshade(normalize(vec3(-g * uHeightScale, 1.0)), L.Ldir, 0.45, 0.92, 1.08);
    return L.base * mix(1.0, hd, L.damp);
  }

  vec4 T = gfxTerrain(L.world);
  float texT = smoothstep(uHoiZoom.z, uHoiZoom.w, uZoom);
  float near = smoothstep(uHoiNear.x, uHoiNear.y, uZoom);
  float slope = length(g) * hexW;
  g += gfxErosionGrad(L.world, g, T.b, uHoiRock.w * texT);
  float slopeE = length(g) * hexW;

  // ---- biyom ağırlıkları (vic3 ile aynı ölçülmüş kar/kaya kuralı) ----
  GfxBiome b = gfxBiomeAt(L.world);
  float w[12];
  w[0] = b.forest; w[1] = b.jungle; w[2] = b.grass; w[3] = b.steppe;
  w[4] = b.desert; w[5] = b.tundra; w[6] = 0.0; w[7] = b.rock;
  // Kumsal yarı payda: HOI4 kıyısı ince; tam payda kıyı boyu bir hex enli
  // açık şerit okunuyordu.
  w[8] = b.marsh; w[9] = b.beach * 0.45; w[10] = 0.0; w[11] = 0.0;

  float alpine = b.snow * T.b;
  float polar = b.snow * (1.0 - T.b);
  float ridge = T.r - T.g;
  // Güneşe bakan yüz karı erken bırakır: kar sınırı oluk boyunca parmaklanır.
  float facing = clamp(dot(-g * uHeightScale, L.Ldir.xy) / L.Ldir.z, -1.5, 1.5);
  float sn = alpine + ridge * uHoiSnow.z - slopeE * uHoiSnow.w - facing * 0.16
    + (gfxFbm(L.world, 26.0, 3, 17.0) - 0.5) * 0.30;
  float snowCov = smoothstep(uHoiSnow.x - uHoiSnow.y, uHoiSnow.x + uHoiSnow.y, sn);
  float polarN = polar + (gfxFbm(L.world, 60.0, 4, 29.0) - 0.5) * 0.45;
  snowCov = max(snowCov, smoothstep(0.34, 0.52, polarN));
  float steep = smoothstep(uHoiRock.x, uHoiRock.y, slopeE) * smoothstep(0.1, 0.5, T.b);
  float rockAdd = steep * uHoiRock.z;

  float sum = 0.0;
  for (int k = 0; k < 12; k++) sum += w[k];
  float inv = 1.0 / max(sum, 1e-4);
  for (int k = 0; k < 12; k++) w[k] *= inv * (1.0 - snowCov) * (1.0 - rockAdd);
  w[HK_ROCK] += rockAdd * (1.0 - snowCov);
  w[HK_SNOW] = snowCov;

  // Tarla yorganı: ekilebilir ovada, nüfuslu ve kalkınmış province'te sık.
  vec2 dv = hoiDev(L);
  float farmD = clamp(0.42 + (dv.y - 0.5) * 0.88 + dv.x * 0.15, 0.0, 1.0);
  float flatG = 1.0 - smoothstep(0.10, 0.26, slope);
  float arable = w[HK_GRASS] + w[HK_STEPPE] * 0.8 + w[HK_FOREST] * 0.30 + w[HK_JUNGLE] * 0.12 + w[HK_MARSH] * 0.2;
  float patchN = gfxFbm(L.world, 70.0, 3, 23.0);
  float farm = smoothstep(uHoiFarm.y - 0.12, uHoiFarm.y + 0.12, patchN * uHoiFarm.z + farmD * 0.75) * flatG;
  farm = clamp(farm * uHoiFarm.x, 0.0, 1.0);
  w[HK_FIELDS] = arable * farm;
  w[HK_GRASS] *= 1.0 - farm; w[HK_STEPPE] *= 1.0 - farm * 0.8; w[HK_FOREST] *= 1.0 - farm * 0.30;
  w[HK_JUNGLE] *= 1.0 - farm * 0.12; w[HK_MARSH] *= 1.0 - farm * 0.2;

  // ---- en güçlü iki katman; üçüncünün payı düşülür (sıra değişince sıçrama yok) ----
  int i1 = 0;
  int i2 = 1;
  float w1 = -1.0;
  float w2 = -1.0;
  float w3 = 0.0;
  vec3 palSmooth = vec3(0.0);
  float wt = 0.0;
  for (int k = 0; k < 11; k++) {
    float v = w[k];
    palSmooth += HOI_PAL[k] * v;
    wt += v;
    if (v > w1) { w3 = max(w2, 0.0); w2 = w1; i2 = i1; w1 = v; i1 = k; }
    else if (v > w2) { w3 = max(w2, 0.0); w2 = v; i2 = k; }
    else if (v > w3) w3 = v;
  }
  palSmooth /= max(wt, 1e-4);
  float a1 = max(w1 - w3, 0.0);
  float a2 = max(w2 - w3, 0.0);

  vec2 o = L.wp - uFieldOrigin;
  float macro = near * 2.5;
  float coarseW = mix(1.0, 0.3, near);
  HoiS s1 = hoiSample(i1, o, L.px, macro, coarseW);
  HoiS s2 = hoiSample(i2, o, L.px, macro, coarseW);
  float tLin = a2 / max(a1 + a2, 1e-5);
  // Yükseklikle karışım: taç çayırın, kaya karın üstünden geçer.
  float e1 = a1 + s1.h * 0.6;
  float e2 = a2 + s2.h * 0.6;
  float mm = max(e1, e2) - 0.10;
  float b1 = max(e1 - mm, 0.0);
  float b2 = max(e2 - mm, 0.0);
  float t = mix(tLin, b2 / max(b1 + b2, 1e-5), texT);

  float amp = uHoiMode > 0.5 ? uHoiLightT.w : 1.0;
  vec3 c1 = i1 == HK_FIELDS ? hoiFieldColor(s1.a) : HOI_PAL[i1] * (1.0 + (s1.a / hoiMean(i1) - 1.0) * HOI_TEXAMP[i1] * amp);
  vec3 c2 = i2 == HK_FIELDS ? hoiFieldColor(s2.a) : HOI_PAL[i2] * (1.0 + (s2.a / hoiMean(i2) - 1.0) * HOI_TEXAMP[i2] * amp);
  vec3 sub = mix(palSmooth, mix(c1, c2, t), texT);
  vec2 gd = mix(s1.g, s2.g, t) * mix(HOI_TEXAMP[i1], HOI_TEXAMP[i2], t);

  // ---- ışık: arazi normali + doku eğimi; ortalamayı koruyan sınırlı gölge ----
  vec3 N = normalize(vec3(-(g * uHeightScale + gd * uHoiLight.w * texT), 1.0));
  // Sırt bir tık açık, vadi bir tık koyu: sınırlı toplam pay, çarpan yığını değil.
  float cav = clamp(ridge * 0.9, -0.06, 0.06) * smoothstep(0.05, 0.5, T.b);

  if (uHoiMode > 0.5) {
    // ARAZİ / COĞRAFYA: siyasetsiz, askerî palet. Kar beyaza yakın: üst
    // sınır alçak, biçimi gölge anlatır.
    float hT = gfxHillshade(N, L.Ldir, uHoiLightT.x, mix(uHoiLightT.y, 0.68, snowCov), mix(uHoiLightT.z, 1.06, snowCov));
    vec3 col = sub * mix(1.0, hT * (1.0 + cav), L.damp) * uHoiLift;
    float shadeAmt = clamp((1.0 - hT) * 2.5, 0.0, 1.0);
    return mix(col, col * vec3(0.90, 0.97, 1.10), snowCov * shadeAmt);
  }

  // SİYASİ: aydınlanmış arazinin üstüne yarı saydam ülke örtüsü.
  float hP = gfxHillshade(N, L.Ldir, uHoiLight.x, mix(uHoiLight.y, 0.70, snowCov), mix(uHoiLight.z, 1.06, snowCov));
  vec3 terr = sub * hP * (1.0 + cav);
  // Örtü altında arazi parlaklığı ortaya sıkışır (ton kalır): kar tülün
  // altından bembeyaz çıkınca tek ülke iki ülke gibi okunuyordu.
  terr = gfxWithLuma(terr, HOI_LMID + (gfxLuma(terr) - HOI_LMID) * uHoiFarm.w);
  float a = mix(uHoiWash.x, uHoiWash.y, smoothstep(uHoiNear.z, uHoiNear.w, uZoom));
  vec3 washed = mix(terr, country, a);
  // Örtü de kabartmanın bir payını alır: renkli dağ düz boya gibi durmasın.
  washed *= mix(1.0, hP, a * uHoiWash.w);
  return mix(washed, paperCol, paper);
}

/**
 * Kesin uzaklık (dünya birimi): x ülke sınırı, y kıyı. Kaynak, fillCells'in
 * hex başına hücre sınırı tablosu: pikselin hexine değen (+2.5 birim pay)
 * her parça. Ortak uzaklık alanı (uBand) işaretsiz ve hex başına 4 teksel;
 * çift doğrusal okumada çizginin üstünde bile ~yarım teksel (yakında 6 px)
 * okur, birkaç piksellik şerit orada ancak kesik kesik çıkıyordu.
 * Ülke sınırı: iki yanı da kara ve sahip rengi farklı (siyasi kipte uOwner
 * ülke başına tek renktir, tileColor).
 */
vec2 hoiBorderDist(GfxLand L) {
  vec2 dd = vec2(1e9);
  if (uSegOn < 0.5) return dd;
  vec4 head = texelFetch(uSegHead, ivec2(L.cell), 0);
  int n = int(head.y + 0.5);
  int start = int(head.x + 0.5);
  vec2 center = vec2((L.raw.x + 0.5 * mod(L.raw.y, 2.0)) * SQ3 * uHexSize, L.raw.y * 1.5 * uHexSize);
  vec2 p = L.world - center;
  for (int i = 0; i < 64; i++) {
    if (i >= n) break;
    int k = (start + i) * 2;
    vec4 inf = texelFetch(uSegData, ivec2((k + 1) % uSegW, (k + 1) / uSegW), 0);
    vec2 ca = cellOf(inf.x);
    vec2 cb = cellOf(inf.y);
    bool seaA = texelFetch(uHex, ivec2(ca), 0).r >= 0.5;
    bool seaB = texelFetch(uHex, ivec2(cb), 0).r >= 0.5;
    bool coast = seaA != seaB;
    if (!coast && (seaA || distance(texelFetch(uOwner, ivec2(ca), 0).rgb, texelFetch(uOwner, ivec2(cb), 0).rgb) < 0.004)) continue;
    vec4 seg = texelFetch(uSegData, ivec2(k % uSegW, k / uSegW), 0);
    vec2 e = seg.zw - seg.xy;
    vec2 ap = p - seg.xy;
    float d = length(ap - e * clamp(dot(ap, e) / max(dot(e, e), 1e-6), 0.0, 1.0));
    if (coast) dd.y = min(dd.y, d);
    else dd.x = min(dd.x, d);
  }
  return dd;
}

/** Şerit payı: sınırda tam, içe doğru hafif sönüm, W pikselde keskin kenar (yarım piksel AA). */
float hoiStrip(float dpx, float W) {
  return (1.0 - smoothstep(W - 0.6, W + 0.6, dpx)) * mix(1.0, 0.7, clamp(dpx / W, 0.0, 1.0));
}

/**
 * HOI4 sınır şeridi: ülkenin doygun rengi, sınırdan içeri birkaç ekran
 * pikseli, kenarı keskin; ülke sınırı çizgisinin hemen içinde. Kıyıda payı
 * düşük: şerit ülkeler arası sınırın imzası.
 */
vec3 gfxBand(GfxLand L, vec3 col, float bd) {
  if (uHoiMode > 0.5) return col;
  float W = uHoiFringe.x;
  float dF = bd * HOI_REACH;
  // Alan (önyargısı yukarı, ~yarım teksel) şeridin çok dışındaysa döngü yok.
  if (dF * uZoom > W + 1.0 + 8.0 * uZoom) return col;
  vec2 dd = hoiBorderDist(L);
  // Tablodan kaçan parça (yalnız uzak zoomda, şerit hex payını aşınca):
  // alanın gördüğü çizgi bulunan kıyı da değilse kaçan ülke sınırıdır.
  float coastW = gfxCoastDist(L.world) * uHexSize * 1.7320508;
  float dB = dd.x;
  if (dd.y > dF + 3.0 && coastW > dF + max(5.0, 3.0 / uZoom)) dB = min(dB, dF);
  float f = max(hoiStrip(dB * uZoom, W), hoiStrip(dd.y * uZoom, W) * uHoiFringe.w);
  if (f <= 0.0) return col;
  // Şerit içeriden doygun ve bir tık koyu: uzak kâğıtta içi zaten düz ülke
  // rengidir, yalnız doygunluk farkı orada şeridi göstermiyordu.
  vec3 fc = hoiSat(L.base, uHoiFringe.z);
  fc = gfxWithLuma(fc, gfxLuma(L.base) * HOI_FRINGE_L);
  return mix(col, fc, f * uHoiFringe.y);
}

// Veri kiplerinde klasik derece (seçim yüzeyi bugünkü gibi okunsun); diğer
// kiplerde eğri yok: S eğrisi koyu paleti bir kez daha karartırdı.
vec3 gfxPost(GfxLand L, vec3 col) { return uHoiMode > 1.5 ? gfxClassicGrade(col) : col; }
`;

const TUNE = {
  // Döşeme: vic3'ten bir tık ince (48 → döşeme ~3.3 hex), kaba 14.
  tilesFine: 48,
  tilesCoarse: 14,
  // Zoom: kâğıt 0.42 altında tam, 0.72'de arazi tam; doku 0.45 → 1.3;
  // yakın ayrıntı 1.4 → 3.0; örtü 0.8 → 2.4 arasında incelir.
  paper0: 0.42,
  paper1: 0.72,
  tex0: 0.45,
  tex1: 1.3,
  near0: 1.4,
  near1: 3.0,
  washZ0: 0.8,
  washZ1: 2.4,
  // Örtü payı (orta / yakın), ülke doygunluk çarpanı, örtünün kabartma payı.
  washMid: 0.66,
  washClose: 0.54,
  countrySat: 1.75,
  washRelief: 0.55,
  // Siyasi ışık: kazanç, alt/üst sınır (Kerem: 0.88..1.28 civarı kabul), doku eğimi.
  relief: 0.95,
  lightLo: 0.80,
  lightHi: 1.22,
  bump: 3.2,
  // Arazi kipi ışığı ve doku payı.
  reliefT: 1.2,
  // Arazi kipi kazancı: ölçüldü, ormanlık 07 kadrajı klasikten −4.3 meanL koyuydu.
  terrLift: 1.06,
  lightTLo: 0.74,
  lightTHi: 1.28,
  texTerr: 1.0,
  // Sınır şeridi: genişlik (CSS px), güç, doygunluk, kıyıdaki payı.
  fringePx: 5.0,
  fringe: 1.0,
  fringeSat: 1.9,
  fringeCoast: 0.45,
  // Kâğıt: lif, dokuma, leke, renk açması.
  paperFibre: 0.22,
  paperWeave: 0.05,
  paperStain: 0.12,
  paperLift: 1.12,
  // Kar (vic3'te ölçülmüş eşikler: örtü zirve hexlerinde kalır).
  snowAt: 0.48,
  snowSoft: 0.07,
  snowRidge: 4.5,
  snowSlope: 0.45,
  // Kaya: eğim başı/sonu, azami pay; yakın zoom oluk genliği.
  rockS0: 0.28,
  rockS1: 0.62,
  rockAmt: 0.6,
  erosion: 0.024,
  // Tarla payı, eşik, yama payı; örtü altında arazi parlaklığının kalan payı.
  farm: 1.0,
  farmAt: 0.74,
  farmPatch: 0.55,
  washLuma: 0.65,
  // Sınır kalemleri (CSS px).
  countryPx: 2.0,
  provincePx: 1.1,
};

let hostRenderer = null;
let means = new Float32Array(VIC_LAYERS.length).fill(0.5);

const MODE_POLITICAL = new Set(['political', 'cultures']);
const MODE_TERRAIN = new Set(['terrain', 'geography']);

function hoiMode() {
  const m = hostRenderer?.mapMode;
  if (MODE_POLITICAL.has(m)) return 0;
  if (MODE_TERRAIN.has(m)) return 1;
  return 2;
}

/** Arazi gölgesi taşımayan sahte arazi: ownerTint'in TERRAIN_SHADE'i 1 olur. */
const FLAT = { id: 'HOI4_FLAT' };

function ownerIndex(tile, world) {
  if (tile.owner >= 0) return tile.owner;
  if (tile.fringeOf >= 0) return world.provinces?.[tile.fringeOf]?.owner ?? -1;
  return -1;
}

const HOI4 = registerGfxStyle({
  name: 'hoi4',
  label: 'HOI4',
  // 41: diğer prototip dallarının küçük id'leriyle birleşmede çakışmasın.
  id: 41,
  glsl: GLSL,
  tune: TUNE,
  textures: {
    uHoiTex: {
      unit: 14,
      target: 0x8C1A, // TEXTURE_2D_ARRAY
      create(gl) {
        const t0 = performance.now();
        const r = buildVicTextures(gl, 14);
        means = r.means;
        HOI4.texBuildMs = +(performance.now() - t0).toFixed(1);
        return r.tex;
      },
    },
  },
  uniforms(t) {
    return {
      uHoiMode: hoiMode(),
      uHoiMeanA: [means[0], means[1], means[2], means[3]],
      uHoiMeanB: [means[4], means[5], means[6], means[7]],
      uHoiMeanC: [means[8], means[9], means[10], means[11]],
      uHoiTiles: [t.tilesFine, t.tilesCoarse],
      uHoiZoom: [t.paper0, t.paper1, t.tex0, t.tex1],
      uHoiNear: [t.near0, t.near1, t.washZ0, t.washZ1],
      uHoiWash: [t.washMid, t.washClose, t.countrySat, t.washRelief],
      uHoiLight: [t.relief, t.lightLo, t.lightHi, t.bump],
      uHoiLightT: [t.reliefT, t.lightTLo, t.lightTHi, t.texTerr],
      uHoiFringe: [t.fringePx, t.fringe, t.fringeSat, t.fringeCoast],
      uHoiPaper: [t.paperFibre, t.paperWeave, t.paperStain, t.paperLift],
      uHoiSnow: [t.snowAt, t.snowSoft, t.snowRidge, t.snowSlope],
      uHoiRock: [t.rockS0, t.rockS1, t.rockAmt, t.erosion],
      uHoiFarm: [t.farm, t.farmAt, t.farmPatch, t.washLuma],
      uHoiLift: t.terrLift,
    };
  },
  hexData: (world) => devHexData(world),
  hexDataKey: (world) => devHexKey(world),
  /**
   * Siyasi/kültür kipinde arazi gölgesiz ülke rengi: arazi shader'da sürekli
   * alandan gelir; hexe pişmiş TERRAIN_SHADE onu ikinci kez, hex basamağıyla
   * verirdi. Diğer kipler oyunun rengi.
   */
  tileColor(tile, world, renderer) {
    const mode = renderer.mapMode;
    if (mode === 'political') {
      const o = ownerIndex(tile, world);
      if (o < 0) return 'hsl(80 8% 44%)';
      return renderer.ownerTint(world.nations[o], FLAT, null, world);
    }
    if (mode === 'cultures') {
      if (tile.culture < 0) return 'hsl(80 8% 44%)';
      return renderer.ownerTint(world.cultures[tile.culture], FLAT, null, world);
    }
    return null;
  },
  /**
   * Ülke sınırı koyu ve keskin (şerit rengi iki yanda zaten taşıyor), state
   * sınırı daha ince, daha açık ve kesikli. Uzak dokuda kesik doku pikseline
   * düşüp kumlanır: orada düz ve ince.
   */
  lines(mode, scale, far) {
    if (mode !== 'political') return null;
    const t = HOI4.tune;
    return {
      province: far
        ? [{ w: 0.9, color: 'rgba(16, 20, 22, 0.30)' }]
        : [{ w: t.provincePx, color: 'rgba(14, 18, 20, 0.46)', dash: [5, 3.5], cap: 'butt' }],
      country: [{ w: far ? 1.6 : t.countryPx, color: 'rgba(8, 10, 12, 0.92)' }],
    };
  },
  attach(renderer) {
    hostRenderer = renderer;
  },
  detach() {
    hostRenderer = null;
  },
});
