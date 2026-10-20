// VIC3 SANAT YÖNÜ (?gfx=vic3) — Victoria 3 / Imperator / HOI4 haritası.
//
// Fikir: uzakta temiz bir siyasi "kâğıt" harita, yaklaştıkça gerçek ışık
// alan arazi. İki ucu tek bir zoom solgunu (uzak 0.45 → yakın 1.6) bağlar:
//   - Uzakta: ülke rengi düz, kenarlar keskin; arazi yalnız dağın ortalamayı
//     koruyan hafif gölgesi. Klasik görünümün koyu bulut lekeleri (pigment
//     fBm + hex başına kabartma platoları) YOK — kaynakları burada çağrılmaz.
//   - Yakında: biyom alt katmanı (temel pişirmenin sürekli ağırlıkları; hex
//     mozaiği yok) + çalışma anında üretilen ayrıntı dokuları (taç, tarla,
//     kaya katmanı, kumul...) iki ölçekte, en güçlü iki biyom yükseklikle
//     karışır; tepe gölgesi + doku eğimi Ldir ile (deniz ile aynı güneş).
//
// Siyasi kipte ülke rengi bir PARLAKLIK tülüdür: ton ve doygunluk ülkenin,
// parlaklık araziden ve sınırlı (Kerem: "suluboya" yok — ülke rengi arazi
// rengine doğru karıştırılmaz; komşu ülkeler her zoomda ayrılır). Arazi ve
// coğrafya kiplerinde aynı alt katman siyasetsiz, iklim renkleriyle çizilir.
//
// Deniz bu stile kapalıdır (seaColor ortaktır, three.js denizi #map-water'ı
// kırar). Veri kiplerinde (L.damp 0.28) yalnız hafif gölge: seçim yüzeyi.

import { registerGfxStyle } from './registry.js';
import { buildVicTextures, VIC_LAYERS, GRAD_SCALE } from './vic3Textures.js';
import { devHexKey } from './devData.js';
import { DEVELOPMENT_MAX } from '../../game/econ/defs.js';

const GLSL = `
uniform highp sampler2DArray uVicTex;   // birim 14 — ayrıntı dokuları (vic3Textures.js)
uniform float uVicMode;      // 0 siyasi/kültür, 1 arazi/coğrafya, 2 veri/seçim
uniform vec4 uVicMeanA;      // katman albedo ortalamaları 0-3
uniform vec4 uVicMeanB;      // 4-7
uniform vec4 uVicMeanC;      // 8-11
uniform vec2 uVicTiles;      // ince / kaba döşemenin dünya enine sığma sayısı (tam sayı)
uniform vec4 uVicLight;      // x yakın kabartma, y uzak kabartma, z alt, w üst (siyasi)
uniform vec4 uVicLightT;     // arazi kipi: x kazanç, y uzak kazanç, z alt, w üst
uniform vec4 uVicDetail;     // x doku payı siyasi, y doku payı arazi, z doku eğimi, w erozyon
uniform vec4 uVicWash;       // x biyom parlaklık payı (siyasi), y çarpan alt, z çarpan üst, w kar parlaklığı
uniform vec4 uVicSnow;       // x eşik, y yumuşaklık, z sırt payı, w eğim payı
uniform vec4 uVicRock;       // x eğim başı, y eğim sonu, z kaya payı, w -
uniform vec4 uVicFarm;       // x tarla payı, y yama eşiği, z kasaba yarıçapı (hex), w kasaba büyümesi
uniform vec4 uVicZoom;       // x solgun başı, y solgun sonu, z yakın başı, w yakın sonu
uniform float uVicDebug;     // 0 kapalı; 1 kar örtüsü, 2 kaya, 3 tarla, 4 kasaba (gri zemin üstünde)

const float VIC_TEX = 512.0;
const float VIC_GS = ${GRAD_SCALE.toFixed(1)};
const int VK_FOREST = 0;
const int VK_JUNGLE = 1;
const int VK_GRASS = 2;
const int VK_STEPPE = 3;
const int VK_DESERT = 4;
const int VK_TUNDRA = 5;
const int VK_SNOW = 6;
const int VK_ROCK = 7;
const int VK_MARSH = 8;
const int VK_BEACH = 9;
const int VK_FIELDS = 10;
const int VK_URBAN = 11;

// İklim paleti (gama uzayı). Klasik arazi renklerinin (terrain.js) parlaklık
// ailesinde kalır: coğrafya kipi kararmaz, yalnız doğallaşır.
const vec3 VIC_PAL[12] = vec3[12](
  vec3(0.26, 0.42, 0.25),
  vec3(0.19, 0.41, 0.26),
  vec3(0.50, 0.60, 0.34),
  vec3(0.67, 0.65, 0.42),
  vec3(0.85, 0.72, 0.48),
  vec3(0.56, 0.57, 0.45),
  vec3(0.82, 0.84, 0.88),
  vec3(0.55, 0.52, 0.48),
  vec3(0.37, 0.45, 0.31),
  vec3(0.86, 0.78, 0.58),
  vec3(0.58, 0.58, 0.35),
  vec3(0.56, 0.50, 0.44)
);

// Siyasi kipte katman başına doku payı: orman, tarla, kasaba, kaya okunsun;
// çayır, kumsal, bozkır sakin kalsın (ülke rengi üstünde benek gürültü gibi
// okunuyordu).
const float VIC_POLTEX[12] = float[12](1.0, 1.0, 0.40, 0.45, 0.65, 0.55, 0.70, 0.90, 0.80, 0.35, 1.0, 1.0);

float vicMean(int k) {
  vec4 m = k < 4 ? uVicMeanA : (k < 8 ? uVicMeanB : uVicMeanC);
  int c = k & 3;
  return c == 0 ? m.x : (c == 1 ? m.y : (c == 2 ? m.z : m.w));
}

struct VicS { float a; float h; vec2 g; };

/**
 * İki ölçekli örnek. İnce döşeme dünyaya düz, kaba döşeme 90° döndürülmüş
 * (o.yx): iki ölçeğin tekrar ızgarası hizalanmaz. İkisi de dünya enini tam
 * sayı kez böler, sarmalda dikiş yok. LOD analitik (landColor dallı akışta,
 * türev yok). Yakın zoomda kaba ölçek bulanık okunur (macroBias): dev taçlar
 * değil, ormanın seyreklik/yoğunluk dalgası olarak kalır.
 */
VicS vicSample(int layer, vec2 o, float px, float macroBias, float coarseW) {
  float tf = uFieldSpan.x / uVicTiles.x;
  float tc = uFieldSpan.x / uVicTiles.y;
  float lf = max(0.0, log2(px * VIC_TEX / tf));
  float lc = max(macroBias, log2(px * VIC_TEX / tc));
  vec4 f = textureLod(uVicTex, vec3(o / tf, float(layer)), lf);
  vec4 c = textureLod(uVicTex, vec3(o.yx / tc, float(layer)), lc);
  float m = vicMean(layer);
  // Düzenli desenlerin (tarla, kasaba, kumul) kaba kopyası yakında bulanık dev
  // dikdörtgen olarak okunuyordu: onlarda kaba ölçek yakında tamamen söner.
  if (layer >= VK_FIELDS || layer == VK_DESERT) coarseW *= 1.0 - smoothstep(0.0, 0.5, macroBias);
  VicS s;
  s.a = m + (f.r - m) * 0.70 + (c.r - m) * 0.60 * coarseW;
  s.h = mix(f.g, f.g * 0.6 + c.g * 0.4, coarseW);
  s.g = (f.ba - 0.5) / VIC_GS + (c.ab - 0.5) / VIC_GS * 0.45 * coarseW;
  return s;
}

/**
 * Tarla parseli albedosundan ürün rengi: çit, sürülmüş, mera, ekin, buğday.
 * Uzakta parsel karşıtlığı kısılır: orta zoomda tarla yorgan gibi alacalı
 * okunuyordu; yaklaştıkça tam renk.
 */
vec3 vicFieldColor(float a) {
  vec3 c = mix(vec3(0.20, 0.28, 0.15), vec3(0.43, 0.34, 0.25), smoothstep(0.22, 0.30, a));
  c = mix(c, vec3(0.40, 0.51, 0.25), smoothstep(0.32, 0.46, a));
  c = mix(c, vec3(0.60, 0.61, 0.31), smoothstep(0.48, 0.62, a));
  c = mix(c, vec3(0.81, 0.71, 0.43), smoothstep(0.64, 0.78, a));
  return mix(VIC_PAL[VK_FIELDS], c, mix(0.30, 1.0, smoothstep(0.9, 2.2, uZoom)));
}
/**
 * Kasaba: zemin çevrenin rengini alır (çölde kum avlu, ovada bahçe; avlu
 * koyu, sokak açık), çatı kiremit ya da arduvaz (kısık tonlar).
 */
vec3 vicUrbanColor(float a, float h, vec3 surround) {
  vec3 ground = surround * mix(0.82, 1.10, smoothstep(0.38, 0.46, a));
  vec3 roof = mix(vec3(0.48, 0.46, 0.43), vec3(0.62, 0.45, 0.34), smoothstep(0.48, 0.60, a));
  return mix(ground, roof * (0.86 + a * 0.30), smoothstep(0.08, 0.30, h));
}

vec3 vicLayerColor(int k, VicS s, float texAmp, vec3 surround) {
  if (k == VK_FIELDS) return vicFieldColor(s.a);
  if (k == VK_URBAN) return vicUrbanColor(s.a, s.h, surround);
  float r = s.a / vicMean(k);
  return VIC_PAL[k] * (1.0 + (r - 1.0) * texAmp);
}

/**
 * Stil hex verisinin yumuşak okuması: hexBlend'in komşu kuralı (merkezde 1,
 * komşu merkezde 0). Province basamağı (nüfus, tarla) hex kenarında değil bir
 * hex boyunca erir — hex kimliğine bağlı desen ızgarayı yeniden çizerdi.
 * Kasaba izi de buradan: komşulardan biri province merkeziyse uzaklık.
 */
vec4 vicDev(GfxLand L, out float town) {
  town = 0.0;
  if (uGfxHexOn < 0.5) return vec4(0.0);
  float odd = mod(L.raw.y, 2.0);
  float stepX = SQ3 * uHexSize;
  vec2 p = L.world - vec2((L.raw.x + 0.5 * odd) * stepX, L.raw.y * 1.5 * uHexSize);
  vec4 acc = vec4(0.0);
  float ws = 0.0;
  // Kasaba kenarı düz daire olmasın: yön ve konuma bağlı periyodik bozulma.
  float wob = (gfxNoise(L.world, 9.0, 211.0) - 0.5) * 0.55 + (gfxNoise(L.world, 3.5, 213.0) - 0.5) * 0.25;
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
    vec4 v = gfxHexData(nc);
    float d = length(p - off);
    float x = clamp(1.0 - d / stepX, 0.0, 1.0);
    float w = x * x * (3.0 - 2.0 * x);
    if (texelFetch(uHex, ivec2(nc), 0).r < 0.5) {
      acc += v * w;
      ws += w;
    }
    // B = yerleşim boyu (yalnız merkez hexte dolu).
    if (v.b > 0.004) {
      float R = (uVicFarm.z + uVicFarm.w * v.b) * stepX;
      float dd = d / R * (1.0 + wob);
      // Çekirdek + seyrek dış mahalle: dış halkada pay düşük, yükseklikle
      // karışımda yalnız evler (yüksek) kazanır, sokak/avlu çayıra döner.
      town = max(town, max(1.0 - smoothstep(0.55, 1.0, dd), 0.42 * (1.0 - smoothstep(1.0, 1.8, dd))));
    }
  }
  return ws > 1e-4 ? acc / ws : vec4(0.0);
}

vec3 gfxLand(GfxLand L) {
  vec4 T = gfxTerrain(L.world);
  float emerge = smoothstep(uVicZoom.x, uVicZoom.y, uZoom);
  float near = smoothstep(uVicZoom.z, uVicZoom.w, uZoom);
  float hexW = uHexSize * 1.7320508;

  vec2 g = gfxHeightGradMS(L.world, L.px);
  float slope = length(g) * hexW;           // yükseklik birimi / hex
  // Siyasi kipte oluk kısık (ülke rengi üstünde çizik gibi baskın kalıyordu)
  // ve zoom solgununa bağlı; arazi kipinde orta zoomda da açık.
  float texT = uVicMode > 0.5 && uVicMode < 1.5 ? smoothstep(0.25, 0.80, uZoom) : emerge;
  g += gfxErosionGrad(L.world, g, T.b, uVicDetail.w * (uVicMode < 0.5 ? emerge * 0.65 : texT));
  // Oluklu eğim: kar oluk duvarından dökülür, kaya orada çıkar (yakında
  // sırt-vadi dalı okunur; uzakta oluk sönük, taban eğimine eşit).
  float slopeE = length(g) * hexW;

  // ---- biyom ağırlıkları ----
  GfxBiome b = gfxBiomeAt(L.world);
  float w[12];
  w[0] = b.forest; w[1] = b.jungle; w[2] = b.grass; w[3] = b.steppe;
  w[4] = b.desert; w[5] = b.tundra; w[6] = 0.0; w[7] = b.rock;
  w[8] = b.marsh; w[9] = b.beach; w[10] = 0.0; w[11] = 0.0;

  // Kar: dağ karı sırtı tutar, dik yamaçtan dökülür; kutup buzu düz örtü.
  // Eşik biyomun kar ağırlığı üzerinden: SNOW_PEAK hexi 0.82, soğuk dağ en
  // çok 0.30 taşır — örtü zirve hexlerinin payına oturur (~%4.8 kara).
  float alpine = b.snow * T.b;
  float polar = b.snow * (1.0 - T.b);
  float ridge = T.r - T.g;
  // Güneşe bakan yüz karı erken bırakır: oluk duvarlarının biri karlı biri
  // kayalı kalır, kar sınırı oluk boyunca parmaklanır (düz kenarlı "diş macunu" yok).
  float facing = clamp(dot(-g * uHeightScale, L.Ldir.xy) / L.Ldir.z, -1.5, 1.5);
  float sn = alpine + ridge * uVicSnow.z - slopeE * uVicSnow.w - facing * 0.16
    + (gfxFbm(L.world, 26.0, 3, 17.0) - 0.5) * 0.30;
  float snowCov = smoothstep(uVicSnow.x - uVicSnow.y, uVicSnow.x + uVicSnow.y, sn);
  // Kutup buzu düz örtü ama kenarı yumuşak bir elips olmasın: gürültüyle kırılır.
  float polarN = polar + (gfxFbm(L.world, 60.0, 4, 29.0) - 0.5) * 0.45;
  snowCov = max(snowCov, smoothstep(0.34, 0.52, polarN));
  // Kaya: dik yamaçta bitki tutunmaz (yalnız yaylada; ova kıyı rampası değil).
  float steep = smoothstep(uVicRock.x, uVicRock.y, slopeE) * smoothstep(0.1, 0.5, T.b);
  float rockAdd = steep * uVicRock.z;

  float sum = 0.0;
  for (int k = 0; k < 12; k++) sum += w[k];
  float inv = 1.0 / max(sum, 1e-4);
  for (int k = 0; k < 12; k++) w[k] *= inv * (1.0 - snowCov) * (1.0 - rockAdd);
  w[VK_ROCK] += rockAdd * (1.0 - snowCov);
  w[VK_SNOW] = snowCov;

  // Tarla ve kasaba: yalnız ekilebilir ovada, nüfuslu province'te.
  float town;
  vec4 dev = vicDev(L, town);
  float flatG = 1.0 - smoothstep(0.10, 0.26, slope);
  float arable = w[VK_GRASS] + w[VK_STEPPE] * 0.8 + w[VK_FOREST] * 0.30 + w[VK_JUNGLE] * 0.12 + w[VK_MARSH] * 0.2;
  float patchN = gfxFbm(L.world, 75.0, 3, 23.0);
  float farm = smoothstep(uVicFarm.y - 0.12, uVicFarm.y + 0.12, patchN * 0.55 + dev.r * 0.75) * flatG;
  farm = clamp(farm * uVicFarm.x, 0.0, 1.0);
  float fieldW = arable * farm;
  float k1 = 1.0 - farm;
  w[VK_GRASS] *= k1; w[VK_STEPPE] *= 1.0 - farm * 0.8; w[VK_FOREST] *= 1.0 - farm * 0.30;
  w[VK_JUNGLE] *= 1.0 - farm * 0.12; w[VK_MARSH] *= 1.0 - farm * 0.2;
  w[VK_FIELDS] = fieldW;
  // Kasaba yalnız yakında: uzakta province merkezleri benek benek okunuyordu.
  town *= (1.0 - snowCov) * flatG * smoothstep(1.2, 1.9, uZoom);
  // Kasabanın zemini için çevre rengi, kasaba payı binmeden ÖNCE: merkezde
  // diğer ağırlıklar sıfıra iner ve sonradan çıkarmak sıfıra bölüyordu (siyah iz).
  vec3 surround = vec3(0.0);
  float sw = 0.0;
  for (int k = 0; k < 11; k++) { surround += VIC_PAL[k] * w[k]; sw += w[k]; }
  surround /= max(sw, 1e-3);
  for (int k = 0; k < 11; k++) w[k] *= 1.0 - town;
  w[VK_URBAN] = town;

  if (uVicDebug > 0.5) {
    float v = uVicDebug < 1.5 ? snowCov : (uVicDebug < 2.5 ? w[VK_ROCK] : (uVicDebug < 3.5 ? w[VK_FIELDS] : w[VK_URBAN]));
    return mix(vec3(0.25), vec3(1.0, 0.95, 0.2), step(0.5, v)) * (0.8 + 0.2 * v);
  }

  // ---- en güçlü iki biyom ----
  int i1 = 0;
  int i2 = 1;
  float w1 = -1.0;
  float w2 = -1.0;
  float w3 = 0.0;
  vec3 palSmooth = vec3(0.0);
  float wt = 0.0;
  for (int k = 0; k < 12; k++) {
    float v = w[k];
    palSmooth += VIC_PAL[k] * v;
    wt += v;
    if (v > w1) { w3 = max(w2, 0.0); w2 = w1; i2 = i1; w1 = v; i1 = k; }
    else if (v > w2) { w3 = max(w2, 0.0); w2 = v; i2 = k; }
    else if (v > w3) w3 = v;
  }
  palSmooth /= max(wt, 1e-4);
  // Üçüncünün payı düşülür: sıralama yer değiştirdiğinde sıçrama olmasın.
  float a1 = max(w1 - w3, 0.0);
  float a2 = max(w2 - w3, 0.0);

  vec2 o = L.wp - uFieldOrigin;
  float macro = near * 2.5;
  float coarseW = mix(1.0, 0.3, near);
  VicS s1 = vicSample(i1, o, L.px, macro, coarseW);
  VicS s2 = vicSample(i2, o, L.px, macro, coarseW);
  float tLin = a2 / max(a1 + a2, 1e-5);
  // Yükseklikle karışım: ağaç tacı çayırın üstünden, kaya karın altından.
  float hk = 0.55;
  float e1 = a1 + s1.h * hk;
  float e2 = a2 + s2.h * hk;
  float mm = max(e1, e2) - 0.10;
  float b1 = max(e1 - mm, 0.0);
  float b2 = max(e2 - mm, 0.0);
  float tHb = b2 / max(b1 + b2, 1e-5);
  // Arazi kipinde doku daha erken açılır (siyasetsiz yüzeyde kâğıt düzlüğü
  // aranmaz; mip ortalaması uzakta zaten tona iner).
  float t = mix(tLin, tHb, texT);

  float r1 = 1.0 + (s1.a / vicMean(i1) - 1.0) * VIC_POLTEX[i1];
  float r2 = 1.0 + (s2.a / vicMean(i2) - 1.0) * VIC_POLTEX[i2];
  float ratio = mix(r1, r2, t);
  vec2 gd = mix(s1.g, s2.g, t);
  // Siyasi kipte doku eğimi de katman payıyla: kumsal dalgacığı ülke rengi
  // üstünde çizgili kumaş gibi okunuyordu.
  if (uVicMode < 0.5) gd *= mix(VIC_POLTEX[i1], VIC_POLTEX[i2], t);

  // ---- ışık: arazi normali + doku eğimi, ortalamayı koruyan gölge ----
  vec2 S = g * uHeightScale + gd * uVicDetail.z * texT;
  vec3 N = normalize(vec3(-S, 1.0));

  if (uVicMode > 1.5) {
    // Veri kipi: seçim yüzeyi; yalnız kısık kabartma.
    float hd = gfxHillshade(N, L.Ldir, uVicLight.y, 0.92, 1.08);
    return L.base * mix(1.0, hd, L.damp);
  }

  if (uVicMode > 0.5) {
    // ARAZİ / COĞRAFYA: siyasetsiz alt katman, iklim renkleriyle.
    float kT = mix(uVicLightT.y, uVicLightT.x, texT);
    // Kar zaten beyaza yakın: ışık tarafı tavana çarpıp plastik parlıyordu.
    // Karda üst sınır alçak, gölge tarafı derin (beyaz kalır, biçimi gölge anlatır).
    float hiT = mix(mix(1.16, uVicLightT.w, texT), 1.06, snowCov);
    float loT = mix(mix(0.86, uVicLightT.z, texT), 0.66, snowCov);
    float hT = gfxHillshade(N, L.Ldir, kT, loT, hiT);
    vec3 c1 = vicLayerColor(i1, s1, uVicDetail.y, surround);
    vec3 c2 = vicLayerColor(i2, s2, uVicDetail.y, surround);
    vec3 sub = mix(palSmooth, mix(c1, c2, t), texT);
    // Sırt/vadi tonu: pişmiş ayrıntı yüksekliği (h − taban) ortalaması ~0 bir
    // alan; sırt bir tık açık, vadi bir tık koyu. Çarpan değil sınırlı toplam
    // bir pay: orta zoomda kabartma yumuşak hamur gibi okunmasın.
    float cav = clamp(ridge * 0.9, -0.07, 0.07) * smoothstep(0.05, 0.5, T.b);
    vec3 col = sub * mix(1.0, hT * (1.0 + cav), L.damp);
    // Karın gölgesi soğuk: düz gri gölge karı plastik gösteriyordu.
    float shadeAmt = clamp((1.0 - hT) * 2.5, 0.0, 1.0);
    return mix(col, col * vec3(0.90, 0.96, 1.08), snowCov * shadeAmt);
  }

  // SİYASİ: ton ve doygunluk ülkenin, parlaklık arazinin (sınırlı).
  float k = mix(uVicLight.y, uVicLight.x, emerge);
  float hill = gfxHillshade(N, L.Ldir, k, mix(0.93, uVicLight.z, emerge), mix(1.10, uVicLight.w, emerge));
  float subL = gfxLuma(palSmooth);
  // Biyom parlaklığı TERRAIN_SHADE × 0.22'nin sürekli karşılığı (orman bir tık
  // koyu, kar bir tık açık); kar yakında biraz daha öne çıkar.
  float bl = 1.0 + (subL / 0.54 - 1.0) * uVicWash.x * mix(0.6, 1.0, emerge);
  bl += snowCov * uVicWash.w * emerge;
  float tex = 1.0 + (ratio - 1.0) * uVicDetail.x * emerge;
  float m = clamp(hill * tex * bl, uVicWash.y, uVicWash.z);
  vec3 country = L.base;
  return gfxWithLuma(country, gfxLuma(country) * mix(1.0, m, L.damp));
}

// Veri kiplerinde klasik derece korunur: seçim yüzeyi bugünkü gibi okunsun
// (parlaklığı klasikle aynı kalır). Diğer kiplerde eğri yok: S eğrisi koyu
// siyasi paleti bir kez daha karartıyordu.
vec3 gfxPost(GfxLand L, vec3 col) { return uVicMode > 1.5 ? gfxClassicGrade(col) : col; }
`;

const TUNE = {
  // Dünya enine sığan döşeme sayısı (tam sayı: sarmal dikişsiz). 40 → ince
  // döşeme 4 hex; 12 → kaba 13 hex.
  tilesFine: 40,
  tilesCoarse: 12,
  // Siyasi ışık: yakın kazanç, uzak kazanç, alt/üst sınır.
  // 2026-10-14 (Kerem: "paintten çizilmiş gibi"): ülke rengi düz kova dolgusu
  // gibi okunuyordu; kabartma ve aralık açıldı (0.75 / 0.82..1.20 →
  // 1.5 / 0.64..1.42). Ton ve doygunluk yine ülkenin: komşular ayrışır,
  // suluboya yok — yalnız parlaklık araziden.
  reliefNear: 1.5,
  reliefFar: 0.45,
  lightLo: 0.64,
  lightHi: 1.42,
  // Arazi kipi ışığı.
  reliefT: 1.15,
  reliefTFar: 0.7,
  lightTLo: 0.72,
  lightTHi: 1.30,
  // Doku payları ve doku eğimi, yakın zoom oluk genliği.
  texPol: 1.2,
  texTerr: 0.85,
  bump: 3.0,
  erosion: 0.022,
  // Siyasi tül: biyom parlaklık payı, toplam çarpan sınırları, karın açılması.
  biomeLum: 0.42,
  modLo: 0.62,
  modHi: 1.50,
  snowLift: 0.10,
  // Kar eşiği/yumuşaklığı, sırt payı, eğim payı.
  snowAt: 0.48,
  snowSoft: 0.07,
  snowRidge: 4.5,
  snowSlope: 0.45,
  // Kaya: eğim başı/sonu (yükseklik / hex), azami pay.
  rockS0: 0.28,
  rockS1: 0.62,
  rockAmt: 0.55,
  // Tarla payı, yama eşiği; kasaba yarıçapı (hex) ve büyüklükle büyüme.
  farm: 1.0,
  farmAt: 0.76,
  townR: 0.12,
  townGrow: 0.42,
  // Zoom solgunu: arazi 0.3 → 1.0 belirir (eskiden 0.45 → 1.6: orta zoomda
  // arazi hiç görünmüyordu), yakın ayrıntı 1.4 → 3.0.
  z0: 0.3,
  z1: 1.0,
  zn0: 1.4,
  zn1: 3.0,
  // Hata ayıklama görünümü: 1 kar, 2 kaya, 3 tarla, 4 kasaba.
  debug: 0,
};

let hostRenderer = null;
let means = new Float32Array(VIC_LAYERS.length).fill(0.5);

const MODE_POLITICAL = new Set(['political', 'cultures']);
const MODE_TERRAIN = new Set(['terrain', 'geography']);

function vicMode() {
  const m = hostRenderer?.mapMode;
  if (MODE_POLITICAL.has(m)) return 0;
  if (MODE_TERRAIN.has(m)) return 1;
  return 2;
}

/** Arazi gölgesi taşımayan sahte arazi: ownerTint'in TERRAIN_SHADE'i 1 olur. */
const FLAT = { id: 'VIC3_FLAT' };

function ownerIndex(tile, world) {
  if (tile.owner >= 0) return tile.owner;
  if (tile.fringeOf >= 0) return world.provinces?.[tile.fringeOf]?.owner ?? -1;
  return -1;
}

/**
 * Yerleşim boyu: province nüfusunun logaritması (dünya medyanına göre) +
 * şehir payı. Yalnız merkez hexe yazılır; shader komşudan uzaklıkla açar.
 */
function vicHexData(world) {
  const cols = world.cols;
  const rows = world.rows;
  const out = new Uint8Array(cols * rows * 4);
  const provinces = world.provinces ?? [];
  const per = [];
  const pops = [];
  for (const p of provinces) {
    const n = p.tileIdx?.length ?? 0;
    if (n && p.econ) {
      per.push(p.econ.population / n);
      pops.push(p.econ.population);
    }
  }
  per.sort((a, b) => a - b);
  pops.sort((a, b) => a - b);
  const median = per.length ? Math.max(1, per[per.length >> 1]) : 1;
  const popMed = pops.length ? Math.max(1, pops[pops.length >> 1]) : 1;
  const cityAt = new Map();
  for (const c of world.cities ?? []) {
    const t = c.tile;
    if (t) cityAt.set(t.row * cols + t.col, c);
  }
  for (const p of provinces) {
    const e = p.econ;
    const idx = p.tileIdx;
    if (!e || !idx?.length) continue;
    const dens = Math.log2(Math.max(1, e.population / idx.length) / median);
    // Tarla yoğunluğu: nüfus yoğunluğu (oktav), verim × kalkınma (tarla
    // binası 2026-10-15'te kalktı) ve kalkınma.
    const dev = Math.min(1, (e.development ?? 0) / DEVELOPMENT_MAX);
    const farmLv = Math.max(0, Math.min(1, (p.fertility ?? 1) * (e.development ?? 1) / 9));
    const farm = Math.max(0, Math.min(1, 0.42 + dens * 0.22 + farmLv * 0.35 + dev * 0.15));
    const g = Math.round(Math.max(0, Math.min(1, 0.5 + dens * 0.25)) * 255);
    const centre = p.center ? p.center.row * cols + p.center.col : -1;
    let size = 0;
    if (centre >= 0) {
      const city = cityAt.get(centre);
      const popOct = Math.log2(Math.max(1, e.population) / popMed);
      size = Math.max(0.15, Math.min(1, 0.35 + popOct * 0.18 + dev * 0.25 + (city ? 0.25 + (city.level ?? 1) * 0.05 : 0)));
    }
    for (const i of idx) {
      const o = i * 4;
      out[o] = Math.round(farm * 255);
      out[o + 1] = g;
      out[o + 2] = i === centre ? Math.round(size * 255) : 0;
      out[o + 3] = ((e.development ?? 1) >= 5 ? 64 : 0) + (i === centre ? 128 : 0);
    }
  }
  return out;
}

const VIC3 = registerGfxStyle({
  name: 'vic3',
  label: 'Victoria',
  id: 3,
  glsl: GLSL,
  tune: TUNE,
  textures: {
    uVicTex: {
      unit: 14,
      // TEXTURE_2D_ARRAY (WebGL2 sabiti; gl nesnesi burada yok).
      target: 0x8C1A,
      create(gl) {
        // Süre ölçülür (getGfxStyle('vic3').texBuildMs): üretim stil seçilince
        // bir kez, ortalama okuması GPU'yu bekler; takılma bütçesi görünür olsun.
        const t0 = performance.now();
        const r = buildVicTextures(gl, 14);
        means = r.means;
        VIC3.texBuildMs = +(performance.now() - t0).toFixed(1);
        return r.tex;
      },
    },
  },
  uniforms(t) {
    return {
      uVicMode: vicMode(),
      uVicMeanA: [means[0], means[1], means[2], means[3]],
      uVicMeanB: [means[4], means[5], means[6], means[7]],
      uVicMeanC: [means[8], means[9], means[10], means[11]],
      uVicTiles: [t.tilesFine, t.tilesCoarse],
      uVicLight: [t.reliefNear, t.reliefFar, t.lightLo, t.lightHi],
      uVicLightT: [t.reliefT, t.reliefTFar, t.lightTLo, t.lightTHi],
      uVicDetail: [t.texPol, t.texTerr, t.bump, t.erosion],
      uVicWash: [t.biomeLum, t.modLo, t.modHi, t.snowLift],
      uVicSnow: [t.snowAt, t.snowSoft, t.snowRidge, t.snowSlope],
      uVicRock: [t.rockS0, t.rockS1, t.rockAmt, 0],
      uVicFarm: [t.farm, t.farmAt, t.townR, t.townGrow],
      uVicZoom: [t.z0, t.z1, t.zn0, t.zn1],
      uVicDebug: t.debug,
    };
  },
  hexData: (world) => vicHexData(world),
  hexDataKey: (world) => `${devHexKey(world)}:${world.cities?.length ?? 0}`,
  /**
   * Siyasi/kültür kipinde arazi gölgesiz ülke rengi: arazi artık shader'da
   * sürekli alandan gelir; hexe pişmiş TERRAIN_SHADE onu ikinci kez, hex
   * basamağıyla verirdi. Province kademesi de yok (Vic3: ülke tek renk;
   * province'i çizgi ayırır). Diğer kipler oyunun rengi.
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
  // Kip bilgisi uniforms()'a gelmez; renderer burada tutulur. uOwner'ın stile
  // bağlı rengi için ayrı tazeleme gerekmez: setGfxStyle invalidateCache ister.
  attach(renderer) {
    hostRenderer = renderer;
  },
  detach() {
    hostRenderer = null;
  },
});
