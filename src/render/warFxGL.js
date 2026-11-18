// Savaş efektlerinin GPU katmanı: alev, duman, top ateşi, yanık toprak.
//
// Ayrı tuval, zeminle 2B harita ARASINDA: GL kipinde 2B tuval karayı boyamaz,
// yalnız sınır, şehir, sayaç ve yazı taşır. Efekt onların altında kaldığı için
// muharebenin en yoğun anında bile sayaç ve künye okunur.
//
// Alev ve duman parçacık değildir: ui/fireGL.js'in sıcaklık alanı yöntemi,
// ama gürültü her pikselde hesaplanmaz. Açılışta GPU'da bir kez pişirilen
// döşenebilir fBm dokusundan okunur; alev başına maliyet birkaç doku okumasına
// iner ve kırk şehir yanarken de kare bütçesi taşmaz.
//
// Top çakmaları ve patlamalar durumsuzdur: konum ve evre tepe gölgelendiricisinde
// (zaman, tohum) çiftinden türer. Kare başına JS işi yoktur, oyunun zarına da
// dokunulmaz.
//
// Katman notu: DOM ve GPU'ya dokunur, oyun durumunu okumaz (bkz. warFx.js).

import { GpuTimer } from './gpuTimer.js';
import { FireSim, REAL_FIRE_GLSL, program, uniforms } from './warFireSim.js';

/** Örnek başına kayan nokta sayısı: üç vec4 (iA, iB, iC). */
export const STRIDE = 12;

/** Çizim sırası: sonraki öncekinin üstüne biner. */
export const FX = {
  FRONT: 0, GLOW: 1, ARROW: 2, SHIP: 3, SPLASH: 4, BURST: 5, SMOKE: 6, FLAME: 7, FLASH: 8, POINT: 9,
};
const FX_COUNT = 10;

/** Yanık alanı tekselinin A kanalı bu kadar haftayı kodlar (45 yıl 8 bite sığsın). */
export const SCAR_WEEK_STEP = 10;
/** Keskinlik sınırı: alev ve duman yumuşak, 2x piksel fark edilmeden pahalı. */
const MAX_DPR = 1.5;
const NOISE_SIZE = 512;

const BAKE_VS = `#version 300 es
layout(location=0) in vec2 aC;
out vec2 vP;
void main() { vP = aC * 0.5 + 0.5; gl_Position = vec4(aC, 0.0, 1.0); }`;

// Periyotlu değer gürültüsü: oktav katsayıları fireGL ile aynı, böylece oradaki
// alev formülü aynı dağılımla çalışır.
const BAKE_FS = `#version 300 es
precision highp float;
in vec2 vP;
out vec4 o;
float hash(vec2 p, float s) {
  p = fract((p + s * 0.37) * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float pnoise(vec2 p, float per, float s) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  vec2 a = mod(i, per), b = mod(i + 1.0, per);
  return mix(mix(hash(a, s), hash(vec2(b.x, a.y), s), u.x),
             mix(hash(vec2(a.x, b.y), s), hash(b, s), u.x), u.y);
}
float fbm(vec2 uv, float per, float s) {
  float a = 0.5, v = 0.0;
  for (int i = 0; i < 5; i++) {
    v += a * pnoise(uv * per, per, s + float(i) * 7.0);
    per *= 2.0;
    a *= 0.5;
  }
  return v;
}
float worley(vec2 uv, float per) {
  vec2 p = uv * per, i = floor(p), f = fract(p);
  float d = 1.0;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 g = vec2(float(x), float(y));
    vec2 c = mod(i + g, per);
    d = min(d, length(g + vec2(hash(c, 3.1), hash(c, 9.7)) - f));
  }
  return clamp(d, 0.0, 1.0);
}
void main() {
  o = vec4(fbm(vP, 4.0, 1.0), fbm(vP, 4.0, 11.0), fbm(vP, 8.0, 23.0), worley(vP, 8.0));
}`;

const VS_HEAD = `#version 300 es
precision highp float;
layout(location=0) in vec2 aC;
layout(location=1) in vec4 iA;
layout(location=2) in vec4 iB;
layout(location=3) in vec4 iC;
layout(std140) uniform Frame { mat4 uVP; vec4 uF0; vec4 uF1; };
#define uPx (uF0.xy)
#define uZoom (uF0.z)
#define uRefW (uF0.w)
#define uTime (uF1.x)
#define uDetail (uF1.y)
#define uWind (uF1.z)
uniform float uShift;
out vec2 vUv;
out vec2 vW;
out float vPh;
flat out vec4 vI;
flat out float vLife;
vec2 hash22(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  q += dot(q, q.yzx + 33.33);
  return fract((q.xx + q.yz) * q.zy);
}
vec4 anchor(vec2 w) { return uVP * vec4(w.x + uShift, w.y, 0.0, 1.0); }
// Dik pano: çapa zemine, gövde ekrana dik (eğik kamerada da ayakta durur).
void upright(vec2 w, vec2 off) {
  vec4 c = anchor(w);
  c.xy += off * uZoom * (uRefW / c.w) * uPx * c.w;
  gl_Position = c;
}
float life() {
  return clamp((uTime - iC.x) / 0.9, 0.0, 1.0) * clamp((iC.y - uTime) / 2.5, 0.0, 1.0);
}
void hide() { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); vLife = 0.0; }
`;

const FS_HEAD = `#version 300 es
precision highp float;
layout(std140) uniform Frame { mat4 uVP; vec4 uF0; vec4 uF1; };
#define uPx (uF0.xy)
#define uZoom (uF0.z)
#define uRefW (uF0.w)
#define uTime (uF1.x)
#define uDetail (uF1.y)
#define uWind (uF1.z)
uniform sampler2D uN;
in vec2 vUv;
in vec2 vW;
in float vPh;
flat in vec4 vI;
flat in float vLife;
out vec4 o;
float tR(vec2 p) { return texture(uN, p * 0.25).r; }
float tG(vec2 p) { return texture(uN, p * 0.25).g; }
float tB(vec2 p) { return texture(uN, p * 0.125).b; }
`;

/** Tabanı çapada duran pano: vUv.x -1..1, vUv.y 0 (taban) .. 1 (tepe). */
const VS_STANDING = `
void main() {
  float l = life() * uDetail;
  if (l <= 0.0) { hide(); return; }
  vUv = vec2(aC.x, aC.y * 0.5 + 0.5);
  vI = iB; vLife = l; vPh = 0.0; vW = iA.xy;
  upright(iA.xy, vec2(aC.x * iA.z * 0.5, (aC.y * 0.5 + 0.5) * iA.w));
}`;

/** Çevrimli patlama: her çevrimde muharebe alanının başka bir noktasında belirir. */
const cycled = (slow, fast, visible, wide, tall, dip) => `
void main() {
  float l = life() * uDetail;
  float rate = mix(${slow}, ${fast}, fract(iB.x * 13.7));
  float cycle = uTime / rate + iB.x * 37.0;
  float n = floor(cycle), ph = fract(cycle);
  if (l <= 0.0 || ph > ${visible}) { hide(); return; }
  vec2 h = hash22(vec2(iB.x * 91.0, n));
  float a = h.x * 6.2832, r = sqrt(h.y) * iA.z;
  vec2 at = iA.xy + vec2(cos(a), sin(a) * 0.72) * r;
  float s = iA.w * mix(0.72, 1.2, hash22(vec2(n, iB.x * 17.0)).x);
  vUv = vec2(aC.x, aC.y * 0.5 + 0.5);
  vI = iB; vLife = l; vPh = ph / ${visible}; vW = at;
  upright(at, vec2(aC.x * s * ${wide}, (aC.y * 0.5 + 0.5) * s * ${tall} - s * ${dip}));
}`;

const VS = {
  [FX.FRONT]: `
void main() {
  float c = cos(iB.z), s = sin(iB.z);
  vec2 off = vec2(aC.x * (iA.z * 0.5 + iA.w), aC.y * iA.w);
  vW = iA.xy + vec2(off.x * c - off.y * s, off.x * s + off.y * c);
  vUv = off;
  vI = vec4(iA.z * 0.5, iA.w, iB.x, iB.y);
  vLife = life() * uDetail; vPh = 0.0;
  gl_Position = anchor(vW);
}`,
  [FX.GLOW]: `
void main() {
  float l = life() * uDetail;
  if (l <= 0.0) { hide(); return; }
  vUv = aC; vI = iB; vLife = l; vPh = 0.0; vW = iA.xy;
  gl_Position = anchor(iA.xy + aC * iA.zw);
}`,
  [FX.ARROW]: `
void main() {
  float ph = fract(uTime * 0.42 + iB.x);
  vec2 d = iA.zw - iA.xy;
  vec2 u = d / max(length(d), 0.001);
  vec2 n = vec2(-u.y, u.x);
  float size = max(iB.w, 12.0 / uZoom);
  vW = mix(iA.xy, iA.zw, ph) + u * aC.x * size + n * aC.y * size * 0.82;
  vUv = aC; vI = iB; vPh = ph;
  vLife = life() * uDetail * sin(ph * 3.14159);
  gl_Position = anchor(vW);
}`,
  [FX.SHIP]: `
void main() {
  float l = life() * uDetail;
  if (l <= 0.0) { hide(); return; }
  float c = cos(iB.z), s = sin(iB.z);
  vec2 off = aC * iA.zw * 0.5;
  vW = iA.xy + vec2(off.x * c - off.y * s, off.x * s + off.y * c);
  vUv = aC; vI = iB; vLife = l; vPh = clamp((iC.y - uTime) / 9.0, 0.0, 1.0);
  gl_Position = anchor(vW);
}`,
  [FX.SPLASH]: cycled('3.1', '5.2', '0.62', '0.55', '1.25', '0.14'),
  [FX.BURST]: cycled('2.3', '4.4', '0.55', '0.62', '1.3', '0.1'),
  [FX.SMOKE]: VS_STANDING,
  [FX.FLAME]: VS_STANDING,
  [FX.FLASH]: `
void main() {
  float l = life() * uDetail;
  float rate = mix(0.55, 1.5, fract(iB.x * 13.7));
  float cycle = uTime / rate + iB.x * 53.0;
  float n = floor(cycle), ph = fract(cycle);
  if (l <= 0.0 || ph > 0.2) { hide(); return; }
  vec2 h = hash22(vec2(iB.x * 71.0, n));
  float a = h.x * 6.2832, r = sqrt(h.y) * iA.z;
  vec2 at = iA.xy + vec2(cos(a), sin(a) * 0.72) * r;
  vUv = aC; vI = iB; vLife = l; vPh = ph / 0.2; vW = at;
  upright(at, aC * iA.w);
}`,
  [FX.POINT]: `
void main() {
  float l = life() * (1.0 - uDetail);
  if (l <= 0.0) { hide(); return; }
  vUv = aC; vI = iB; vLife = l; vPh = 0.0; vW = iA.xy;
  upright(iA.xy, aC * iA.z / uZoom);
}`,
};

const FS = {
  // Cephe ışığı: hat boyunca kayan gürültüyle titrer, parlama değil kor gibi durur.
  [FX.FRONT]: `
void main() {
  float dx = max(abs(vUv.x) - vI.x, 0.0);
  float d = length(vec2(dx, vUv.y)) / vI.y;
  float g = exp(-d * d * 5.0) * (1.0 - smoothstep(0.72, 1.0, d));
  float slow = tR(vW * 0.0065 + vec2(uTime * 0.05, -uTime * 0.035));
  float fast = tG(vW * 0.021 + vec2(-uTime * 0.21, uTime * 0.17));
  float flick = smoothstep(0.3, 0.72, slow * 0.72 + fast * 0.42);
  vec3 c = mix(vec3(0.62, 0.11, 0.015), vec3(1.0, 0.46, 0.12), g * flick);
  o = vec4(c * g * (0.13 + 0.3 * flick) * vLife, 0.0);
}`,
  [FX.GLOW]: `
void main() {
  float r = length(vUv);
  float e = exp(-r * r * 3.4) * (1.0 - smoothstep(0.72, 1.0, r));
  float s = vI.x * 37.0;
  float f;
  if (vI.z < 0.5) {
    f = 0.62 + 0.62 * tR(vec2(uTime * 0.31 + s, s * 0.7));
  } else {
    float a = fract(uTime * 0.73 + s), b = fract(uTime * 1.31 + s * 1.7);
    f = 0.3 + 0.9 * exp(-a * 7.0) + 0.55 * exp(-b * 9.0);
  }
  vec3 c = mix(vec3(1.0, 0.3, 0.06), vec3(1.0, 0.62, 0.25), e);
  o = vec4(c * e * f * (0.3 + 0.5 * vI.y) * vLife, 0.0);
}`,
  [FX.ARROW]: `
void main() {
  float v = vUv.x + abs(vUv.y) * 0.9 - 0.15;
  float wing = smoothstep(1.0, 0.72, abs(vUv.y));
  float stroke = smoothstep(0.27, 0.16, abs(v)) * wing;
  float halo = smoothstep(0.5, 0.28, abs(v)) * smoothstep(1.05, 0.8, abs(vUv.y));
  vec3 c = vI.z < 0.5 ? vec3(0.44, 0.68, 0.38)
    : vI.z < 1.5 ? vec3(0.42, 0.6, 0.8)
    : vI.z < 2.5 ? vec3(0.86, 0.33, 0.24) : vec3(0.85, 0.72, 0.47);
  float a = max(stroke, halo * 0.5);
  vec3 col = mix(vec3(0.03, 0.025, 0.02), c, stroke / max(a, 0.001));
  a *= vLife * (0.5 + 0.5 * vI.y);
  o = vec4(col * a, a);
}`,
  [FX.SHIP]: `
void main() {
  float w = 0.42 * (1.0 - pow(abs(vUv.x), 3.2));
  float hull = 1.0 - smoothstep(w - 0.07, w, abs(vUv.y));
  float tower = (1.0 - smoothstep(0.28, 0.34, abs(vUv.x + 0.06)))
    * (1.0 - smoothstep(0.13, 0.19, abs(vUv.y)));
  vec3 c = mix(vec3(0.045, 0.05, 0.055), vec3(0.14, 0.135, 0.13), tower);
  float ember = smoothstep(0.42, 0.72, tR(vec2(vUv.x * 2.6 + uTime * 0.35, vUv.y * 2.0 - uTime * 0.2)));
  c += vec3(1.0, 0.34, 0.06) * ember * 0.7;
  // Batış kıçtan başlar: su hattı gövdeyi boydan boya yutar.
  float sink = smoothstep(vPh * 2.3 - 1.25, vPh * 2.3 - 1.0, -vUv.x);
  float a = hull * (1.0 - sink) * vLife;
  o = vec4(c * a, a);
}`,
  [FX.SPLASH]: `
void main() {
  float ph = vPh, s = vI.x * 51.0;
  vec2 q = vUv;
  float n = tR(vec2(q.x * 1.8 + s, q.y * 1.7 - ph * 1.3));
  float n2 = tG(vec2(q.x * 3.6 - s, q.y * 3.0 - ph * 2.1) + n);
  float up = sin(min(ph * 1.28, 1.0) * 3.14159);
  float w = mix(0.2, 0.62, q.y) * (0.8 + ph * 0.8);
  float body = 1.0 - smoothstep(w * 0.42, w, abs(q.x) + (n - 0.5) * 0.46);
  float top = 1.0 - smoothstep(up * 0.62, up, q.y + (n2 - 0.5) * 0.36);
  float jet = body * top * smoothstep(0.0, 0.05, q.y) * (1.0 - smoothstep(0.55, 1.0, ph));
  vec2 e = vec2(q.x, (q.y - 0.07) * 5.2);
  float rr = mix(0.08, 0.96, smoothstep(0.08, 1.0, ph));
  float ring = (1.0 - smoothstep(0.0, 0.14, abs(length(e) - rr) + (n2 - 0.5) * 0.16))
    * (1.0 - smoothstep(0.45, 1.0, ph));
  vec3 c = mix(vec3(0.66, 0.78, 0.84), vec3(0.98, 1.0, 1.0), clamp(q.y * 0.8 + n2 * 0.5, 0.0, 1.0));
  float a = max(jet * 0.94, ring * 0.62) * vLife;
  o = vec4(c * a, a);
}`,
  // Toprak fışkırır, ateş topu ilk anda parlar ve söner; dumanı SMOKE taşır.
  [FX.BURST]: `
void main() {
  float ph = vPh, s = vI.x * 43.0;
  vec2 q = vUv;
  float n = tR(vec2(q.x * 1.5 + s, q.y * 1.5 - ph * 1.3));
  float n2 = tG(vec2(q.x * 3.3 - s, q.y * 3.1 - ph * 2.4) + n);
  float h = 0.25 + 0.75 * smoothstep(0.0, 0.34, ph);
  float w = mix(0.14, 0.9, pow(q.y, 0.72)) * mix(0.62, 1.0, h);
  float shape = 1.0 - smoothstep(0.42 * w, w, abs(q.x) + (n - 0.5) * 0.62);
  float top = 1.0 - smoothstep(h * 0.5, h, q.y + (n2 - 0.5) * 0.46);
  float dirt = shape * top * smoothstep(0.0, 0.05, q.y) * (1.0 - smoothstep(0.38, 1.0, ph));
  vec3 dc = mix(vec3(0.13, 0.095, 0.065), vec3(0.37, 0.3, 0.22), clamp(q.y + (n2 - 0.5), 0.0, 1.0));
  vec2 b = vec2(q.x, (q.y - 0.18) * 1.5);
  float R = mix(0.1, 0.66, smoothstep(0.0, 0.2, ph));
  float hot = (1.0 - smoothstep(R * 0.2, R, length(b) + (n2 - 0.5) * 0.42)) * (1.0 - smoothstep(0.08, 0.32, ph));
  vec3 hc = mix(vec3(1.0, 0.34, 0.04), vec3(1.0, 0.88, 0.56), smoothstep(0.35, 0.9, hot));
  float da = dirt * 0.82;
  vec3 col = dc * da * (1.0 - hot) + hc * hot * 1.25;
  float a = max(da, hot * 0.8);
  o = vec4(col * vLife, a * vLife);
}`,
  // Sütun yükseldikçe genişler ve rüzgârla eğilir; biçimi yoğunluk eşiği verir,
  // dışarıdan çizilmiş bir kontur yoktur.
  [FX.SMOKE]: `
void main() {
  float x = vUv.x, y = vUv.y, seed = vI.x;
  float t = uTime * (0.13 + 0.04 * fract(seed * 7.3)) + seed * 31.0;
  float sway = tR(vec2(seed * 3.0, y * 0.9 - t * 0.5)) - 0.5;
  float cx = x - (uWind * 0.5 + sway * 1.05) * y * sqrt(y);
  float r = mix(mix(0.075, 0.36, vI.z), 0.72, pow(y, 0.82));
  // Puflar yukarı çıktıkça büyür: desen yükseklikle seyrekleşir, hız da azalır.
  float lift = pow(y, 0.72) * 2.1 - t * 1.75;
  vec2 p = vec2(cx / r * 0.5 + seed * 9.0, lift);
  float warp = tB(p * 0.72);
  float puff = 1.0 - texture(uN, (p + warp * 0.9) * 0.105).a;
  float d = tR(p * 0.78 + warp * 1.25);
  float d2 = tG(p * 2.15 - warp * 0.9 + 3.7);
  float body = puff * 0.46 + d * 0.5 + d2 * 0.3;
  float reach = abs(cx) / r + (warp - 0.5) * (1.1 + y * 0.9) + (d2 - 0.5) * 0.42 + (puff - 0.5) * (0.5 + y * 1.1);
  float edge = 1.0 - smoothstep(0.26, 1.08, reach);
  float rise = smoothstep(0.0, 0.1 + 0.12 * d2, y) * (1.0 - smoothstep(0.34, 1.0, y + (d - 0.5) * 0.7));
  float a = smoothstep(0.2, 0.74, body * edge * 1.62) * rise * (1.0 - smoothstep(0.28, 0.98, y) * 0.62);
  float lit = (tR(p * 0.78 + warp * 1.25 + vec2(-0.13, 0.16)) - d) + (puff - 0.5) * 0.22;
  vec3 c = mix(vec3(0.024, 0.022, 0.021), vec3(0.2, 0.185, 0.17), clamp(y * 0.62 + lit * 2.7 + 0.08, 0.0, 1.0));
  c = mix(c, vec3(0.5, 0.47, 0.42) + lit * 1.4, vI.z);
  c += vec3(0.95, 0.34, 0.06) * vI.w * exp(-y * 7.0) * (0.35 + 0.65 * d);
  float distant = mix(0.55, 1.0, smoothstep(0.42, 0.95, uZoom));
  a *= mix(0.95, 0.58, vI.z) * distant * vLife;
  o = vec4(c * a, a);
}`,
  // Biçim ui/fireGL.js'ten: dil dil kopan alev gürültünün yükseklikle yarışından
  // doğar, taban kavisli ve yırtıktır. Sütun maskesi üçgen, sabit eşik düz taban verir.
  [FX.FLAME]: `
void main() {
  float x = vUv.x, y = vUv.y, seed = vI.x;
  float time = uTime * (0.92 + 0.1 * sin(seed * 3.1)) + seed * 17.0;
  float warp = tR(vec2(x * 1.4 + seed * 5.0, y * 1.5 - time * 1.1));
  x += (warp - 0.5) * (0.25 + y * 1.5);
  float coarse = tG(vec2(x * 2.4 + seed * 3.0, y * 2.0 - time * 1.9) + warp * 1.6);
  float fine = tR(vec2(x * 6.5 - seed, y * 4.6 - time * 3.4) + coarse * 1.2);
  float turb = coarse * 0.72 + fine * 0.38;
  float side = 1.0 - smoothstep(0.42, 1.0, abs(x));
  float heat = (turb * 1.5 - y * 1.08 - 0.12) * side * 2.3;
  float rim = 0.05 + 0.3 * x * x + 0.2 * tG(vec2(x * 3.1 + seed * 7.0, time * 0.7));
  heat *= smoothstep(rim, rim + 0.2, y) * smoothstep(1.0, 0.8, y);
  heat *= mix(0.62, 1.0, smoothstep(0.02, 0.34, y));
  heat = clamp(heat * (0.72 + 0.4 * vI.y) * min(1.0, vLife * 1.4), 0.0, 1.0);
  // Kenar kızıl ve yarı saydam kalır: keskin turuncu kontur çizgi film gibi okunuyor.
  vec3 c = mix(vec3(0.3, 0.025, 0.0), vec3(0.95, 0.2, 0.012), smoothstep(0.06, 0.4, heat));
  c = mix(c, vec3(1.0, 0.5, 0.07), smoothstep(0.34, 0.68, heat));
  c = mix(c, vec3(1.0, 0.72, 0.24), smoothstep(0.7, 0.97, heat));
  c = mix(c, vec3(1.0, 0.9, 0.62), smoothstep(0.985, 1.0, heat));
  float a = smoothstep(0.0, 0.62, heat) * min(1.0, vLife * 2.0);
  o = vec4(c * a, a * 0.82);
}`,
  [FX.FLASH]: `
void main() {
  float r = length(vUv);
  float core = exp(-r * r * 26.0);
  float halo = exp(-r * r * 6.5);
  float streak = exp(-abs(vUv.y) * 30.0) * exp(-abs(vUv.x) * 3.6);
  vec3 c = vec3(1.0, 0.86, 0.6) * core * 1.1 + vec3(1.0, 0.5, 0.14) * (halo * 0.26 + streak * 0.5);
  float edge = 1.0 - smoothstep(0.72, 1.0, r);
  o = vec4(c * exp(-vPh * 4.6) * edge * vLife, 0.0);
}`,
  [FX.POINT]: `
void main() {
  float r = length(vUv);
  float pulse = 0.76 + 0.24 * sin(uTime * (1.9 + vI.x * 1.7) + vI.x * 40.0);
  vec3 c = vI.z < 0.5 ? vec3(1.0, 0.38, 0.1) : vI.z < 1.5 ? vec3(1.0, 0.62, 0.18) : vec3(0.82, 0.92, 0.9);
  float light = exp(-r * r * 17.0) * 1.5 + exp(-r * r * 3.8) * 0.5;
  float edge = 1.0 - smoothstep(0.74, 1.0, r);
  o = vec4(c * light * pulse * edge * vLife * (0.65 + 0.35 * vI.y), 0.0);
}`,
};

// Yanık toprak: dünya dokusundan okunan alan. Altıgen başına dörtgen çizilseydi
// örtüşen köşeler koyu bir petek deseni bırakırdı.
const SCAR_VS = `#version 300 es
precision highp float;
layout(location=0) in vec2 aC;
uniform vec4 uCam;
uniform vec2 uView;
out vec2 vW;
void main() {
  vW = vec2(uCam.x + aC.x * uView.x * 0.5 / uCam.z, uCam.y - aC.y * uView.y * 0.5 / uCam.z);
  gl_Position = vec4(aC, 0.0, 1.0);
}`;

const SCAR_FS = `#version 300 es
precision highp float;
uniform sampler2D uN, uScar, uLand;
uniform vec4 uMap;
uniform float uTurn, uDetail;
in vec2 vW;
out vec4 o;
vec2 hash22(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  q += dot(q, q.yzx + 33.33);
  return fract((q.xx + q.yz) * q.zy);
}
vec3 crater(vec2 w, float cell, float amount, float salt, float wobble) {
  vec2 g = w / cell, id = floor(g), f = fract(g);
  vec2 h = hash22(id + salt);
  if (h.x > amount) return vec3(0.0);
  vec2 dv = f - (0.5 + (hash22(id + salt + 5.0) - 0.5) * 0.12);
  float len = max(length(dv), 0.0001);
  float d = len / mix(0.13, 0.24, h.y) + (wobble - 0.5) * 0.55;
  float pit = 1.0 - smoothstep(0.12, 1.0, d);
  float lit = max(0.0, dot(dv / len, vec2(-0.7071)));
  float rim = (1.0 - smoothstep(0.8, 1.5, d)) * smoothstep(0.3, 0.9, d) * lit * lit;
  float spray = 1.0 - smoothstep(0.7, 2.1, d);
  return vec3(pit, rim, spray);
}
void main() {
  vec2 uv = (vW - uMap.xy) * uMap.zw;
  vec4 nA = texture(uN, vW * 0.0034);
  vec2 warp = (nA.rg - 0.5) * 44.0 * uMap.zw;
  vec4 s = texture(uScar, uv + warp);
  if (s.r + s.g + s.b < 0.012) discard;
  float age = uTurn - s.a * 2550.0;
  float fade = 1.0 - smoothstep(12.0, 312.0, age);
  float land = smoothstep(0.6, 0.88, texture(uLand, uv).r);
  float amount = fade * land * uDetail;
  if (amount <= 0.004) discard;
  float patchy = texture(uN, vW * 0.0043 + 0.31).g * 0.62 + texture(uN, vW * 0.0125 + 0.73).r * 0.52;
  float burn = smoothstep(0.02, 0.55, s.r) * smoothstep(0.5 - 0.4 * s.r, 0.72 - 0.2 * s.r, patchy);
  float wobble = texture(uN, vW * 0.021).r;
  vec3 c1 = crater(vW, 13.0, s.g * 0.34, 3.0, wobble);
  vec3 c2 = crater(vW + 6.5, 29.0, s.g * 0.2, 17.0, wobble);
  float pit = max(c1.x, c2.x);
  float rim = max(c1.y, c2.y);
  float spray = max(c1.z, c2.z) * smoothstep(0.42, 0.74, texture(uN, vW * 0.043).g);
  // Moloz: düzensiz Worley hücreleri; kare ızgara uzaktan piksel gibi görünüyordu.
  float cellDist = texture(uN, vW * 0.0195).a;
  float mottle = texture(uN, vW * 0.0058 + 0.4).r;
  float rubble = (1.0 - smoothstep(0.17, 0.33, cellDist)) * smoothstep(0.08, 0.5, s.b)
    * smoothstep(0.62 - s.b * 0.42, 0.72 - s.b * 0.3, mottle + patchy * 0.34);
  vec3 stone = mix(vec3(0.1, 0.085, 0.07), vec3(0.34, 0.3, 0.25), smoothstep(0.34, 0.66, mottle));
  float ash = smoothstep(0.52, 0.74, texture(uN, vW * 0.031 + 0.17).r);
  vec3 col = mix(vec3(0.04, 0.032, 0.026), vec3(0.2, 0.185, 0.165), ash * 0.55);
  float a = burn * 0.74;
  col = mix(col, vec3(0.05, 0.042, 0.034), spray);
  a = max(a, spray * 0.3);
  col = mix(col, vec3(0.032, 0.027, 0.022), pit);
  a = max(a, pit * pit * 0.6);
  col = mix(col, stone, rubble);
  a = max(a, rubble * 0.72);
  col = mix(col, vec3(0.38, 0.32, 0.24), rim * 0.8);
  a = max(a, rim * 0.17);
  a *= amount;
  o = vec4(col * a, a);
}`;

/** Gerçek alev panosu: sıcaklık alanı aleviyle aynı örnek listesini çizer. */
const REAL_FLAME_VS = `
void main() {
  float l = life() * uDetail;
  if (l <= 0.0) { hide(); return; }
  float size = max(iA.z, iA.w) * 0.92;
  vUv = vec2(aC.x * 0.5 + 0.5, 0.5 - aC.y * 0.5);
  vI = iB; vLife = l; vPh = 0.0; vW = iA.xy;
  upright(iA.xy, vec2(aC.x * size * 0.5, (aC.y * 0.5 + 0.5) * size - size * 0.3));
}`;
const REAL_FLAME_FS = `${REAL_FIRE_GLSL}
void main() {
  vec4 f = realFire(vUv, vI.x, uTime);
  float k = min(1.0, vLife * 1.6) * (0.7 + 0.3 * vI.y);
  o = vec4(f.rgb * k, f.a * k * 0.72);
}`;

const SPRITE_UNIFORMS = ['uShift', 'uN'];
/** mat4 + iki vec4 (std140). */
const FRAME_FLOATS = 24;

export class WarFxGL {
  /** WebGL2 yoksa null: oyun efektsiz, eskisi gibi sürer. */
  static create(afterCanvas) {
    const canvas = document.createElement('canvas');
    canvas.id = 'map-war';
    canvas.setAttribute('aria-hidden', 'true');
    canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;display:none;z-index:0;pointer-events:none';
    const gl = canvas.getContext('webgl2', {
      alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false,
      powerPreference: 'high-performance',
    });
    if (!gl) return null;
    const layer = new WarFxGL(canvas, gl);
    if (!layer.build()) return null;
    afterCanvas.after(canvas);
    return layer;
  }

  constructor(canvas, gl) {
    this.canvas = canvas;
    this.gl = gl;
    this.shown = false;
    this.lost = false;
    this.onRestored = null;
    this.counts = new Array(FX_COUNT).fill(0);
    canvas.addEventListener('webglcontextlost', (event) => {
      event.preventDefault();
      this.lost = true;
    });
    canvas.addEventListener('webglcontextrestored', () => {
      this.lost = false;
      if (this.build()) this.onRestored?.();
    });
  }

  build() {
    const gl = this.gl;
    this.counts.fill(0);
    this.quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);

    this.programs = [];
    this.batches = [];
    for (let kind = 0; kind < FX_COUNT; kind++) {
      const p = program(gl, VS_HEAD + VS[kind], FS_HEAD + FS[kind]);
      if (!p) return false;
      const u = uniforms(gl, p, SPRITE_UNIFORMS);
      gl.uniformBlockBinding(p, gl.getUniformBlockIndex(p, 'Frame'), 0);
      gl.useProgram(p);
      gl.uniform1i(u.uN, 0);
      this.programs.push({ p, u });
      this.batches.push(this.makeBatch());
    }
    const scar = program(gl, SCAR_VS, SCAR_FS);
    if (!scar) return false;
    this.scar = { p: scar, u: uniforms(gl, scar, ['uCam', 'uView', 'uMap', 'uTurn', 'uDetail', 'uN', 'uScar', 'uLand']) };
    this.scarVao = gl.createVertexArray();
    gl.bindVertexArray(this.scarVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    this.frameData = new Float32Array(FRAME_FLOATS);
    this.frameUbo = gl.createBuffer();
    gl.bindBuffer(gl.UNIFORM_BUFFER, this.frameUbo);
    gl.bufferData(gl.UNIFORM_BUFFER, FRAME_FLOATS * 4, gl.DYNAMIC_DRAW);
    gl.bindBufferBase(gl.UNIFORM_BUFFER, 0, this.frameUbo);

    this.noise = this.bakeNoise();
    if (!this.noise) return false;
    this.scarTex = null;
    this.landTex = null;
    this.sim = FireSim.create(gl, this.scarVao, this.quad, () => this.noise);
    const realFlame = program(gl, VS_HEAD + REAL_FLAME_VS, FS_HEAD + REAL_FLAME_FS);
    if (realFlame) {
      gl.uniformBlockBinding(realFlame, gl.getUniformBlockIndex(realFlame, 'Frame'), 0);
      gl.useProgram(realFlame);
      gl.uniform1i(gl.getUniformLocation(realFlame, 'uN'), 0);
      this.realFlame = { p: realFlame, u: uniforms(gl, realFlame, ['uShift', 'uAtlas']) };
    }
    this.atlas = null;
    this.atlasAsked = false;
    this.timer?.dispose();
    this.timer = GpuTimer.create(gl);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.clearColor(0, 0, 0, 0);
    return true;
  }

  /**
   * Alev dokusu ilk yangında yüklenir: barışta açılış bedeli olmasın. Dosya yoksa
   * (depoda değildir, bkz. scripts/fx/bake-fire-atlas.mjs) GPU alevi sürer.
   */
  async loadAtlas() {
    if (this.atlasAsked) return;
    this.atlasAsked = true;
    try {
      const url = new URL('../../assets/fx/fire-atlas.webp', import.meta.url);
      const reply = await fetch(url);
      if (!reply.ok) return;
      const bitmap = await createImageBitmap(await reply.blob());
      if (this.lost) return;
      const gl = this.gl;
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, bitmap);
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      bitmap.close();
      this.atlas = tex;
      if (this.sim) this.sim.atlas = tex;
    } catch {
      // Doku isteğe bağlıdır: yüklenemezse GPU alevi yeter.
    }
  }

  makeBatch() {
    const gl = this.gl;
    const vao = gl.createVertexArray();
    const vbo = gl.createBuffer();
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    for (let i = 0; i < 3; i++) {
      gl.enableVertexAttribArray(1 + i);
      gl.vertexAttribPointer(1 + i, 4, gl.FLOAT, false, STRIDE * 4, i * 16);
      gl.vertexAttribDivisor(1 + i, 1);
    }
    gl.bindVertexArray(null);
    return { vao, vbo };
  }

  /** Döşenebilir gürültüyü GPU'da pişirir: JS'te aynı iş açılışta onlarca ms sürüyordu. */
  bakeNoise() {
    const gl = this.gl;
    const p = program(gl, BAKE_VS, BAKE_FS);
    if (!p) return null;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texStorage2D(gl.TEXTURE_2D, Math.log2(NOISE_SIZE) + 1, gl.RGBA8, NOISE_SIZE, NOISE_SIZE);
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.viewport(0, 0, NOISE_SIZE, NOISE_SIZE);
    gl.disable(gl.BLEND);
    gl.useProgram(p);
    gl.bindVertexArray(this.scarVao);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindVertexArray(null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.deleteFramebuffer(fbo);
    gl.deleteProgram(p);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    gl.enable(gl.BLEND);
    return tex;
  }

  resize(width, height, dpr) {
    const scale = Math.min(MAX_DPR, dpr || 1);
    const w = Math.max(1, Math.round(width * scale));
    const h = Math.max(1, Math.round(height * scale));
    if (this.canvas.width !== w) this.canvas.width = w;
    if (this.canvas.height !== h) this.canvas.height = h;
  }

  /** Görünecek efekt yokken tuval hiç birleştirilmesin: barışta bedel sıfır kalır. */
  show(visible) {
    if (visible === this.shown) return;
    this.shown = visible;
    this.canvas.style.display = visible ? 'block' : 'none';
    if (!visible && !this.lost) this.gl.clear(this.gl.COLOR_BUFFER_BIT);
  }

  upload(kind, data, count) {
    if (this.lost) return;
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.batches[kind].vbo);
    gl.bufferData(gl.ARRAY_BUFFER, data.subarray(0, count * STRIDE), gl.DYNAMIC_DRAW);
    this.counts[kind] = count;
  }

  fieldTexture(tex, internal, format, width, height, data) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, internal, width, height, 0, format, gl.UNSIGNED_BYTE, data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  setLand(width, height, bytes) {
    if (this.lost) return;
    this.landTex ??= this.gl.createTexture();
    this.fieldTexture(this.landTex, this.gl.R8, this.gl.RED, width, height, bytes);
  }

  setScars(width, height, bytes) {
    if (this.lost) return;
    this.scarTex ??= this.gl.createTexture();
    this.fieldTexture(this.scarTex, this.gl.RGBA8, this.gl.RGBA, width, height, bytes);
  }

  /** Yalnız kirli satırlar: tam doku yüklemesi savaş haftalarında kareyi sıçratıyordu. */
  patchScars(y, rows, width, bytes) {
    if (this.lost || !this.scarTex) return;
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.scarTex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, y, width, rows, gl.RGBA, gl.UNSIGNED_BYTE, bytes, y * width * 4);
  }

  drawKind(kind, view, copyShift) {
    const count = this.counts[kind];
    if (!count) return;
    const gl = this.gl;
    const real = kind === FX.FLAME && this.atlas && this.realFlame;
    const { p, u } = real || this.programs[kind];
    gl.useProgram(p);
    gl.uniform1f(u.uShift, copyShift);
    if (real) {
      gl.activeTexture(gl.TEXTURE3);
      gl.bindTexture(gl.TEXTURE_2D, this.atlas);
      gl.activeTexture(gl.TEXTURE0);
      gl.uniform1i(u.uAtlas, 3);
    }
    gl.bindVertexArray(this.batches[kind].vao);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, count);
  }

  drawScars(view) {
    if (!this.scarTex || !this.landTex) return;
    const gl = this.gl;
    const { p, u } = this.scar;
    gl.useProgram(p);
    gl.uniform4f(u.uCam, view.x, view.y, view.zoom, 0);
    gl.uniform2f(u.uView, view.width, view.height);
    gl.uniform4f(u.uMap, view.map[0], view.map[1], view.map[2], view.map[3]);
    gl.uniform1f(u.uTurn, view.turn);
    gl.uniform1f(u.uDetail, view.detail);
    gl.uniform1i(u.uN, 0);
    gl.uniform1i(u.uScar, 1);
    gl.uniform1i(u.uLand, 2);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.scarTex);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.landTex);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindVertexArray(this.scarVao);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  /** @param view { vp, width, height, x, y, zoom, refW, time, wind, turn, detail, map, copies[], ground } */
  render(view) {
    if (this.lost) return;
    const gl = this.gl;
    this.timer?.poll();
    this.timer?.begin();
    if (view.ground && view.detail > 0) this.sim?.step(view.time);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clear(gl.COLOR_BUFFER_BIT);
    const f = this.frameData;
    f.set(view.vp);
    f[16] = 2 / view.width;
    f[17] = 2 / view.height;
    f[18] = view.zoom;
    f[19] = view.refW;
    f[20] = view.time;
    f[21] = view.detail;
    f[22] = view.wind;
    gl.bindBuffer(gl.UNIFORM_BUFFER, this.frameUbo);
    gl.bufferSubData(gl.UNIFORM_BUFFER, 0, f);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.noise);
    if (view.detail > 0 && view.ground) {
      // MAX: komşu cephe parçalarının kesiştiği yerde ışık katlanıp boncuklanmasın.
      gl.blendEquation(gl.MAX);
      for (const shift of view.copies) this.drawKind(FX.FRONT, view, shift);
      gl.blendEquation(gl.FUNC_ADD);
      if (view.scars) this.drawScars(view);
    }
    for (const shift of view.copies) {
      if (view.detail > 0) {
        for (let kind = FX.GLOW; kind <= FX.FLASH; kind++) {
          if (kind === FX.ARROW && !view.ground) continue;
          // Akışkan yangın dumanın üstünde, gürültü alevleriyle aynı sırada.
          if (kind === FX.FLAME && view.ground) this.sim?.draw(shift);
          this.drawKind(kind, view, shift);
        }
      }
      if (view.detail < 1) this.drawKind(FX.POINT, view, shift);
    }
    gl.bindVertexArray(null);
    this.timer?.end();
  }

  gpuMs() {
    return this.timer?.ema ?? null;
  }
}
