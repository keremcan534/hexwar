// Okyanusun son geçişi: dalga eğimi + taban + ışık = piksel.
//
// Işık modeli uydurma bir "güzel su" rampası değil, deniz optiğinin kendisidir:
//   · Güneş yansıması Cox-Munk: L = E·ρ·p(s) / (4·cosθv·cos⁴β). p(s) eğim
//     dağılımıdır; ortalaması ve kovaryansı mipmap'ten (LEAN) okunur, bu yüzden
//     aynı formül yakın zoomda tek tek kıvılcım, uzak zoomda uydu fotoğrafındaki
//     geniş parıltı alanı verir. Geçiş eşiği yoktur.
//   · Su gövdesi Beer-Lambert: taban ışığı λ'ya göre sönümlenir, kırmızı önce
//     gider. Turkuaz boyanmaz; kum üstünde sığ su kendiliğinden turkuaz olur.
//   · Bakış sanal bir gözden gelir: dik ortografik bakışta parıltı hiç oluşmaz.

export function shadeFrag({ cascades = 3, shallow = false, caustics = true } = {}) {
  return `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
#define CASCADES ${cascades}
${shallow ? '#define SHALLOW 1' : ''}
${caustics ? '#define CAUSTICS 1' : ''}
out vec4 fragColor;
uniform vec2 uRes, uCam, uSpan;
uniform int uPersp;
uniform mat4 uInvVP;
uniform vec3 uEye, uSun;
uniform float uTime, uQuiet, uExposure, uGlint;
uniform vec4 uField;
uniform vec3 uTile, uMeanW;
uniform float uWrapX, uSkyK;
uniform sampler2D uA0, uB0, uF0, uA1, uB1, uF1;
#if CASCADES > 2
uniform sampler2D uA2, uB2;
#endif
uniform sampler2D uBathy, uMacro, uFoamTex;
#ifdef SHALLOW
uniform sampler2D uSwe, uSweFoam;
uniform vec4 uSweRect;
uniform float uSweOn;
#endif

const vec3 SUN_E = vec3(5.6, 4.7, 3.6);
const vec3 ZENITH = vec3(0.10, 0.23, 0.48);
const vec3 HORIZON = vec3(0.56, 0.68, 0.80);

/**
 * Dünya sarmalına oturan ölçek: kamera tarih çizgisinden atlayınca desen de
 * aynı yere düşsün. Bölen dünya genişliğini tam böler.
 */
float wk(float s) { return uWrapX > 0.0 ? uWrapX / max(1.0, floor(uWrapX / s + 0.5)) : s; }
vec2 tl(vec2 w, float s) { return vec2(w.x / wk(s), w.y / s); }

vec3 sky(vec3 r) {
  float up = clamp(r.z, 0.0, 1.0);
  vec3 c = mix(HORIZON, ZENITH, pow(up, 0.6));
  float toSun = max(dot(normalize(r), uSun), 0.0);
  return c + vec3(1.0, 0.82, 0.60) * (pow(toSun, 6.0) * 0.45 + pow(toSun, 64.0) * 1.2);
}

float slopePdf(vec2 d, vec3 C) {
  float det = max(C.x * C.y - C.z * C.z, 1e-7);
  float e = (d.x * d.x * C.y - 2.0 * d.x * d.y * C.z + d.y * d.y * C.x) / det;
  return exp(-0.5 * min(e, 40.0)) / (6.2831853 * sqrt(det));
}

float fresnel(float c) {
  float f = 1.0 - clamp(c, 0.0, 1.0);
  return 0.02 + 0.98 * f * f * f * f * f;
}

void addWaves(inout vec2 mean, inout vec3 cov, vec4 a, vec4 b, float g, float keep) {
  vec2 s = a.xy * g;
  vec3 sq = b.xyz * g * g;
  vec3 v = vec3(sq.x - s.x * s.x, sq.y - s.y * s.y, sq.z - s.x * s.y);
  mean += s * keep;
  // Görünmeyen dalga kaybolmaz, pürüzlülüğe yazılır: enerji korunur.
  float lost = 1.0 - keep * keep;
  cov += max(v, vec3(0.0, 0.0, -1.0)) + lost * vec3(s.x * s.x, s.y * s.y, s.x * s.y);
}

vec3 aces(vec3 x) {
  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}
vec3 toSrgb(vec3 c) {
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}
float dither(vec2 p) {
  return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))) - 0.5;
}

/** Kırılma bölgesi: kıyıya paralel cepheler, karaya bakan keskin yüz, arkada iz. */
float surfZone(vec2 w, float sd, float depth, float t, float px, out float wash) {
  wash = 0.0;
  const float REACH = 58.0;
  if (sd > REACH || px > 5.0) return 0.0;
  float nA = texture(uFoamTex, tl(w, 910.0)).g;
  float nB = texture(uFoamTex, tl(w, 260.0) + vec2(t * 0.006, -t * 0.004)).g;
  float s = sd + (nA - 0.47) * 44.0 + (nB - 0.47) * 15.0;
  // Dalga sığlıkta yavaşlar: cepheler kıyıya yaklaştıkça sıklaşır.
  float phase = sqrt(max(s, 0.0) + 5.0) * 1.42 + t * 0.155;
  float id = floor(phase);
  float f = phase - id;
  float seed = fract(id * 0.6180339);
  float gaps = texture(uFoamTex, tl(w, 330.0) + vec2(seed * 7.0, seed * 3.0)).g;
  float patchy = smoothstep(0.34 + seed * 0.18, 0.58 + seed * 0.14, gaps);
  float front = (1.0 - smoothstep(0.0, 0.2, f)) * 0.8 + exp(-f * 4.0) * 0.5;
  // Kırılma derinlikle başlar: sığlık yoksa dalga kıyıya kırılmadan çarpar.
  float breaking = smoothstep(9.0, 2.0, depth);
  float env = smoothstep(REACH, REACH * 0.5, s) * smoothstep(-3.0, 3.0, s);
  wash = exp(-f * 2.6) * env * smoothstep(14.0, 2.5, depth);
  return clamp(front * patchy * max(breaking, 0.2) * env, 0.0, 1.0);
}

void main() {
  vec2 ndc = gl_FragCoord.xy / uRes * 2.0 - 1.0;
  vec3 P;
  if (uPersp == 1) {
    vec4 a = uInvVP * vec4(ndc, -1.0, 1.0);
    vec4 b = uInvVP * vec4(ndc, 1.0, 1.0);
    a /= a.w; b /= b.w;
    vec3 d = b.xyz - a.xyz;
    float k = -a.z / d.z;
    if (k <= 0.0) { fragColor = vec4(0.0); return; }
    P = a.xyz + d * k;
  } else {
    P = vec3(uCam + vec2(ndc.x, -ndc.y) * uSpan * 0.5, 0.0);
  }
  vec2 w = P.xy;
  vec2 fuv = (w - uField.xy) / uField.zw;
  vec4 bath = texture(uBathy, fuv);
  float sd = bath.b;
  float px = max(length(dFdx(w)), length(dFdy(w)));
  float alpha = smoothstep(0.2, max(2.2, px * 1.6), sd);
  vec4 sw = vec4(0.0);
  float sweK = 0.0;
#ifdef SHALLOW
  if (uSweOn > 0.001) {
    vec2 suv = (w - uSweRect.xy) / uSweRect.zw;
    vec2 edge = min(suv, 1.0 - suv);
    sweK = uSweOn * smoothstep(0.015, 0.09, min(edge.x, edge.y));
    if (sweK > 0.001) sw = texture(uSwe, suv);
  }
  // Tırmanan su kumsalın üstüne de çıkar: kara maskesinin dışında ince tabaka.
  alpha = max(alpha, sw.a * sweK * smoothstep(-3.5, -0.3, sd) * 0.72);
#endif
  if (alpha <= 0.002) { fragColor = vec4(0.0); return; }
  float depth = max(bath.r, 0.0);
  // Dünyanın kuzey-güney kenarının ötesinde veri yok: su orada kesilmez, söner.
  alpha *= smoothstep(-20.0, 170.0, w.y - uField.y) * smoothstep(-20.0, 170.0, uField.y + uField.w - w.y);
  if (alpha <= 0.002) { fragColor = vec4(0.0); return; }
  vec3 V = normalize(uEye - P);
  vec3 L = uSun;

  // Geniş deniz hâli yavaşça sürüklenir: rüzgâr cepheleri ve yağ sızıntısı gibi
  // sakin şeritler. Karo tekrarını da asıl bu ölçek kırar.
  vec4 macro = texture(uMacro, fuv * vec2(1.0, 1.0) + vec2(uTime * 0.00042, 0.0));
  vec4 macro2 = texture(uMacro, fuv * vec2(3.0, 3.0) + vec2(-uTime * 0.00031, uTime * 0.0002));
  float gust = mix(macro.r, macro2.r, 0.35);
  float slick = macro.g * (1.0 - smoothstep(0.35, 0.8, gust));
  float groups = mix(0.72, 1.28, macro2.a) * mix(0.70, 1.20, gust);

  // Dalga dibi hisseder: sığlıkta kısa dalga korunur, uzun dalga söner.
  float shoal0 = smoothstep(1.0, 42.0, depth);
  float shoal1 = smoothstep(0.4, 20.0, depth);
  float shoal2 = smoothstep(0.1, 4.0, depth);

  vec2 uv0 = w / uTile.x, uv1 = w / uTile.y;
  vec2 mean = vec2(0.0);
  vec3 cov = vec3(0.0);
  addWaves(mean, cov, texture(uA0, uv0), texture(uB0, uv0), groups * shoal0, uMeanW.x);
  addWaves(mean, cov, texture(uA1, uv1), texture(uB1, uv1), groups * shoal1 * (1.0 - slick * 0.45), uMeanW.y);
#if CASCADES > 2
  vec2 uv2 = w / uTile.z;
  addWaves(mean, cov, texture(uA2, uv2), texture(uB2, uv2),
    mix(0.6, 1.1, gust) * shoal2 * (1.0 - slick * 0.82), uMeanW.z);
#endif
#ifdef SHALLOW
  // Sığ suda dalganın kendisi çözücüden gelir; açıkta FFT taşır.
  float sweW = sweK;
  mean += sw.xy * sweW * 2.6;
  cov += vec3(dot(sw.xy, sw.xy)) * sweW * 0.04;
#endif
  // En kısa dalgaların döndürülmüş ikinci örneği: yakın zoomda yüzey pürüzü.
  // Eksenler yer değiştirdiği için birinci örnekle hizalanmaz, sarmala da oturur.
#if CASCADES > 2
  if (uMeanW.z > 0.01) {
    vec2 rip = w.yx / (uTile.z / 3.0);
    addWaves(mean, cov, texture(uA2, rip), texture(uB2, rip),
      mix(0.45, 0.9, gust) * shoal2 * (1.0 - slick * 0.9), uMeanW.z);
  }
#endif
  // Izgaranın altında kalan kılcal dalgalar (Cox-Munk artığı).
  float capillary = (0.0012 + 0.0052 * gust) * (1.0 - slick * 0.85) * shoal2;
  cov += vec3(capillary * 1.2, capillary, capillary * 0.08);

  vec3 N = normalize(vec3(-mean, 1.0));
  float NdV = max(dot(N, V), 0.04);

  // ---- su gövdesi --------------------------------------------------------
  // Tabana giden ışın eğimle kırılır; kayma derinlikle büyür ama sınırlıdır.
  vec2 bedW = w + mean * min(depth, 26.0) * 0.42;
  vec4 bedS = texture(uBathy, (bedW - uField.xy) / uField.zw);
  float bedD = max(bedS.r, 0.0);
  float clarity = bedS.a;
  vec3 kTropic = vec3(0.34, 0.052, 0.024);
  vec3 kCold = vec3(0.40, 0.115, 0.135);
  vec3 kappa = mix(kCold, kTropic, clarity);
  float path = 1.0 / max(V.z, 0.3) + 1.0 / max(L.z, 0.3);
  vec3 T = exp(-kappa * min(bedD, 90.0) * path);

  float sandN = texture(uFoamTex, tl(bedW, 73.0)).g;
  float sandF = texture(uFoamTex, tl(bedW, 17.0)).g;
  vec3 sand = mix(vec3(0.74, 0.64, 0.46), vec3(0.88, 0.80, 0.62), sandN * 0.8 + sandF * 0.2);
  // Su kıyısında kum ıslak ve koyudur; parlak şerit kara sınırını silerdi.
  sand *= mix(0.62, 1.0, smoothstep(0.5, 9.0, sd));
  vec3 rock = mix(vec3(0.10, 0.13, 0.08), vec3(0.26, 0.24, 0.13), sandN);
  vec3 bed = mix(sand, rock, bedS.g);
  float E = max(L.z, 0.0) * 1.0 + 0.32;

#ifdef CAUSTICS
  // Odaklanma alanı: yüzeyin sıkıştığı yerde ışık tabanda toplanır. Tabanda
  // kaymış iki kaskat kesişince gerçek kostiğin ağ biçimi çıkar.
  if (bedD < 34.0) {
    float j1 = texture(uA1, bedW / uTile.y * 3.0 + vec2(uTime * 0.012, 0.0)).a;
#if CASCADES > 2
    float j2 = texture(uA2, bedW.yx / uTile.z).a;
#else
    float j2 = texture(uA1, bedW / uTile.y * 7.0).a;
#endif
    float focus = clamp(1.0 - (j1 - 1.0) * 2.2 - (j2 - 1.0) * 3.4, 0.0, 3.0);
    focus = pow(focus, 3.6);
    bed *= 0.86 + focus * 0.30 * smoothstep(34.0, 3.0, bedD);
  }
#endif

  // Suyun kendi rengi: saçılan ışık, eddy ve sıcaklıkla kayar.
  float bloom = macro.b * 0.5 + 0.5;
  vec3 deepWarm = mix(vec3(0.0035, 0.024, 0.078), vec3(0.002, 0.042, 0.072), bloom);
  vec3 deepCold = mix(vec3(0.0065, 0.024, 0.042), vec3(0.008, 0.034, 0.040), bloom);
  vec3 scatter = mix(deepCold, deepWarm, clarity);
  vec3 midTone = mix(vec3(0.012, 0.075, 0.075), vec3(0.008, 0.135, 0.165), clarity);
  vec3 inScatter = scatter + midTone * exp(-bedD * 0.05) * 0.9;
  vec3 body = bed * E * T * 0.62 + inScatter * (1.0 - T.g * 0.92);

  // ---- yüzey ışığı -------------------------------------------------------
  vec3 H = normalize(L + V);
  vec2 facet = -H.xy / H.z;
  float p = slopePdf(facet - mean, cov);
  float cosB2 = H.z * H.z;
  float rho = fresnel(dot(L, H));
  float glint = rho * p / (4.0 * NdV * cosB2 * cosB2);
  glint *= smoothstep(0.0, 0.12, L.z);

  // Gök yansıması dar açılı bakışla hesaplanır: sanal gözün geniş lensi parıltı
  // için gerekli, ama ekran kenarında Fresnel'i şişirip denizi süte çeviriyordu.
  // Hafif eğik bakış dalga yüzlerini ayırır: tepeden Fresnel neredeyse sabittir.
  vec3 Vs = normalize(vec3(V.xy * 0.30 - normalize(L.xy + 1e-4) * 0.34, V.z));
  float NdVs = max(dot(N, Vs), 0.04);
  float varSum = cov.x + cov.y;
  float fPow = 5.0 / (1.0 + 22.0 * varSum);
  float F = min(0.02 + 0.98 * pow(1.0 - NdVs, fPow), 0.13) * uSkyK;
  vec3 R = reflect(-Vs, N);
  R.z = abs(R.z);
  vec3 skyR = sky(normalize(R + vec3(0.0, 0.0, varSum * 2.0)));

  // Dalga tepesinden geçen ışık: güneşe karşı duran ince sırt içten aydınlanır.
  float crest = smoothstep(0.10, 0.42, dot(mean, normalize(L.xy + 1e-4)));
  float etaLift = clamp(texture(uA0, uv0).b * 0.09 * uMeanW.x + 0.5, 0.0, 1.0);
  vec3 sss = mix(vec3(0.01, 0.13, 0.10), vec3(0.02, 0.26, 0.24), clarity) * crest * etaLift * 0.2;

#ifdef SHALLOW
  // Sığlıkta dalga yüzü: güneşe dönük yamaç açılır, arka yamaç koyulaşır.
  float face = dot(sw.xy, normalize(L.xy + 1e-4)) * sweW;
  body *= 1.0 + clamp(face * 6.5, -0.42, 0.78);
#endif
  vec3 col = (body + sss) * (1.0 - F) + skyR * F + SUN_E * min(glint, 2.4) * uGlint * (1.0 - uQuiet * 0.9);

  // ---- köpük -------------------------------------------------------------
  float capA = texture(uF0, uv0, 1.2).r * shoal0;
  float capB = texture(uF1, uv1, 1.0).r * shoal1;
  float cap = clamp(max(capA * 0.9, capB) * mix(0.25, 1.35, gust) * (1.0 - slick), 0.0, 1.0);
  // Piksel altına inen yele tek tek nokta gibi kalır ve karo tekrarını ele verir.
  cap *= 1.0 - smoothstep(1.2, 2.8, px);

  float lace = texture(uFoamTex, tl(w, 41.0) + vec2(uTime * 0.0011, 0.0)).r;
  float lace2 = texture(uFoamTex, tl(w, 13.0) - vec2(uTime * 0.0023, uTime * 0.0013)).r;
  float pattern = lace * 0.72 + lace2 * 0.42;
  float farFoam = smoothstep(1.2, 4.0, px);

  float wash;
  float surf = surfZone(w, sd, depth, uTime, px, wash);
#ifdef SHALLOW
  // Çözücünün gördüğü yerde kıyı köpüğü hesaptan değil akıştan gelir.
  float solved = sw.b * sweK;
  surf *= 1.0 - sweK;
  wash = mix(wash, solved * 0.8, sweK);
#endif
  float shore = (1.0 - smoothstep(0.0, 5.5, sd + (texture(uFoamTex, tl(w, 120.0)).g - 0.5) * 8.0
    + sin(uTime * 0.62 + texture(uFoamTex, tl(w, 480.0)).g * 14.0) * 1.6)) * (1.0 - sweK);

  // Beyaz yele rüzgâr yönünde uzar: kırılan tepe arkasında ince bir kuyruk bırakır.
  vec2 windA = vec2(w.x / wk(167.4) + w.y * 0.00296, w.y * 0.0289 - w.x / wk(69.8));
  vec2 windB = vec2(w.x / wk(52.5) + w.y * 0.00945, w.y * 0.0815 - w.x / wk(24.8));
  float capPat = texture(uFoamTex, windA).g * 0.62 + texture(uFoamTex, windB + 0.37).g * 0.38;
  float capCore = smoothstep(0.16, 0.8, cap);
  float capVis = mix(capCore * smoothstep(0.40, 0.72, capPat + capCore * 0.34), cap * 0.32, farFoam);
  // Ağ çizgisi cephe boyunca tel gibi uzar; kırılma yumuşak gürültüyle dağılır.
  float surfPat = texture(uFoamTex, tl(w, 27.0)).g * 0.95 + pattern * 0.3;
  float surfVis = mix(smoothstep(0.42 - surf * 0.36, 0.92 - surf * 0.36, surfPat + surf * 0.32) * smoothstep(0.04, 0.34, surf),
    surf * 0.16, farFoam);
  float washVis = wash * mix(smoothstep(0.42, 1.05, pattern) * 0.92, 0.3, farFoam) * (1.0 - sweK);
  float shoreVis = shore * mix(smoothstep(0.1, 0.72, pattern + 0.16), 0.16, farFoam);

  float foam = clamp(max(max(capVis, surfVis), max(washVis, shoreVis)), 0.0, 1.0);
#ifdef SHALLOW
  // Dolu köpükte hücre çizgisi görünmesin: kapanan kısım yumuşak gürültüyle kırılır.
  float softPat = texture(uFoamTex, tl(w, 23.0) - vec2(uTime * 0.002, 0.0)).g * 0.9 + pattern * 0.42;
  float sweFoam = sweK * smoothstep(0.1, 0.62, sw.b * (0.28 + softPat * 0.72) + sw.b * sw.b * 0.5);
  foam = max(foam, mix(sweFoam, sw.b * 0.7, farFoam));
#endif
  foam *= (1.0 - uQuiet * 0.7) * smoothstep(-2.0, 1.0, sd);
  vec3 foamLit = vec3(0.86, 0.90, 0.91) * (max(L.z, 0.0) * 1.12 + 0.46)
    + vec3(0.03, 0.09, 0.11) * (1.0 - foam);
  col = mix(col, foamLit, foam);

  // Veri kiplerinde deniz sahneden çekilir: renkli harita verisi öne çıksın.
  if (uQuiet > 0.001) {
    float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
    col = mix(col, vec3(l) * vec3(0.72, 0.84, 0.96), uQuiet * 0.78) * mix(1.0, 0.62, uQuiet);
  }

  col = aces(col * uExposure);
  vec3 c = toSrgb(col) + dither(gl_FragCoord.xy) / 255.0;
  fragColor = vec4(c * alpha, alpha);
}`;
}
