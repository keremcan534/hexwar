// Dünya başına bir kez pişen alanlar: deniz tabanı, geniş ölçekli deniz hâli ve
// köpük dokusu. Hepsi GPU'da pişer; açılışta kare bütçesine dokunmaz.
//
// Derinlik haritası kıyı uzaklığından TÜRETİLİR ama kıyıya eşit mesafede aynı
// değildir: şelf genişliği, sığlık, resif ve bank gürültüyle kırılır. Eşit
// aralıklı bant "her kıyıyı saran hale" okunur ve oyuncu onu haritada görür.

import { LINE_COAST, coastMesh, smoothLandAt } from '../borderMesh.js';

const HEAD = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
`;

/**
 * Gradyan gürültü, iki eksende periyodik. Değer gürültüsü eşiklenince eksene
 * paralel kırıklar veriyordu; uzak zoomda deniz devre kartı gibi okunuyordu.
 */
const NOISE = `
float hash21(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * 0.1031);
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}
float gdot(vec2 cell, vec2 per, vec2 d) {
  float a = hash21(mod(cell, per)) * 6.2831853;
  return dot(vec2(cos(a), sin(a)), d);
}
float vnoise(vec2 p, vec2 per) {
  vec2 i = floor(p), f = p - i;
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float v = mix(mix(gdot(i, per, f), gdot(i + vec2(1, 0), per, f - vec2(1, 0)), u.x),
                mix(gdot(i + vec2(0, 1), per, f - vec2(0, 1)), gdot(i + vec2(1, 1), per, f - vec2(1, 1)), u.x), u.y);
  return v * 0.72 + 0.5;
}
float fbm(vec2 p, vec2 per, int oct) {
  float s = 0.0, a = 0.5, n = 0.0;
  for (int i = 0; i < oct; i++) {
    s += a * vnoise(p, per);
    n += a;
    a *= 0.5;
    p *= 2.0;
    per *= 2.0;
  }
  return s / n;
}
float fbmX(vec2 p, float per, int oct) { return fbm(p, vec2(per, 4096.0), oct); }`;

const BATHY_FRAG = `${HEAD}
out vec4 o;
uniform sampler2D uCoast;
uniform vec2 uSize;
uniform float uHex, uAspect;
${NOISE}
void main() {
  vec2 uv = gl_FragCoord.xy / uSize;
  float sd = texture(uCoast, uv).r;
  vec2 q = vec2(uv.x, uv.y * uAspect);
  float lat = abs(uv.y - 0.5) * 2.0;

  // Kıyıdan uzaklık gürültüyle bükülür: şelfin kenarı kıyıya paralel kalmasın.
  float nBroad = fbmX(q * 7.0 + 3.1, 7.0, 4);
  float nMid = fbmX(q * 23.0 + 11.7, 23.0, 4);
  float nFine = fbmX(q * 71.0 + 5.3, 71.0, 3);
  float dh = max(sd, 0.0) / uHex + (nMid - 0.5) * 1.1 * smoothstep(0.0, 1.2, sd / uHex);

  float shelfW = mix(0.45, 4.2, smoothstep(0.28, 0.74, nBroad));
  float t = max(dh, 0.0) / shelfW;
  // Kumsal sıfırda biter: dalga tırmanışı sürekli bir yamaç ister.
  float shelf = 0.055 * max(sd, 0.0) + 40.0 * pow(t, 1.42);
  float abyss = 1300.0 + 3000.0 * nMid;
  float depth = shelf + smoothstep(0.82, 2.3, t) * abyss;

  float tropic = 1.0 - smoothstep(0.34, 0.66, lat);

  // Kum tepeleri: kıyıya paralel sıra sıra sığlık, kırılan dalganın durağı.
  float bars = sin(dh * 19.0 + nMid * 16.0 + nFine * 5.0) * (1.0 - smoothstep(0.1, 1.1, t));
  depth = max(0.055 * max(sd, 0.0), depth + bars * 1.3 * smoothstep(2.0, 12.0, sd));

  // Açık denizde bank ve mercan: okyanusun ortası boş bir renk olmasın.
  float bankN = fbmX(q * 15.0 + 41.0, 15.0, 5);
  float bank = smoothstep(0.585, 0.74, bankN) * smoothstep(1.0, 2.4, dh);
  depth = mix(depth, mix(46.0, 12.0, smoothstep(0.68, 0.82, bankN) * tropic), bank * bank);

  // Resif halkası: şelfin ortasında dar sığlık, arkasında lagün.
  float reefN = fbmX(q * 34.0 + 77.0, 34.0, 4);
  float reef = (1.0 - smoothstep(0.0, 0.05, abs(reefN - 0.53))) * tropic
    * smoothstep(0.15, 0.4, t) * (1.0 - smoothstep(0.75, 1.2, t));
  depth = mix(depth, 1.1 + nFine * 2.0, reef * 0.9);

  // Karaya doğru bayır: dalga tırmanışı için tabanın kuruda da değeri olmalı.
  if (sd < 0.0) depth = sd * 0.42;

  // Taban cinsi: 0 kum, 1 koyu kaya/yosun.
  float rock = smoothstep(0.5, 0.68, fbmX(q * 56.0 + 19.0, 56.0, 4));
  rock = max(rock, reef * 0.65);

  // Berraklık: tropik su mavi cam, soğuk su yeşilimsi ve bulanık.
  float clarity = (1.0 - smoothstep(0.3, 0.86, lat + (nBroad - 0.5) * 0.25));
  clarity *= 1.0 - 0.45 * (1.0 - smoothstep(0.0, 1.5, sd / uHex));
  o = vec4(depth, rock, sd, clarity);
}`;

const MACRO_FRAG = `${HEAD}
out vec4 o;
uniform vec2 uSize;
${NOISE}
void main() {
  // Doku iki eksende de sarar: farklı ölçekte ikinci kez örneklenebilsin.
  vec2 uv = gl_FragCoord.xy / uSize;
  vec2 q = uv * vec2(1.0, 1.0);
  vec2 warp = vec2(fbm(q * vec2(4, 2) + 1.7, vec2(4, 2), 4), fbm(q * vec2(4, 2) + 9.2, vec2(4, 2), 4)) - 0.5;
  vec2 w = q + warp * vec2(0.20, 0.34);
  vec2 warp2 = vec2(fbm(w * vec2(10, 5) + 3.3, vec2(10, 5), 3), fbm(w * vec2(10, 5) + 21.0, vec2(10, 5), 3)) - 0.5;
  vec2 w2 = w + warp2 * vec2(0.05, 0.09);
  float gust = smoothstep(0.30, 0.70, fbm(w * vec2(8, 4), vec2(8, 4), 5));
  // Sakin şeritler rüzgâr yönünde uzar: yağ tabakası kılcal dalgayı öldürür.
  float streak = fbm(w2 * vec2(14, 22) + 6.0, vec2(14, 22), 4);
  float slick = smoothstep(0.58, 0.74, streak);
  float eddy = fbm(w2 * vec2(14, 7) + 31.0, vec2(14, 7), 5) * 2.0 - 1.0;
  float group = fbm(q * vec2(60, 30) + 2.0, vec2(60, 30), 3);
  o = vec4(gust, slick, eddy, group);
}`;

const FOAM_TEX_FRAG = `${HEAD}
out vec4 o;
uniform vec2 uSize;
${NOISE}
vec2 cellPoint(vec2 c, float per) {
  c = mod(c, per);
  return vec2(hash21(c), hash21(c + 17.3));
}
/** Periyodik Worley: x kenar yakınlığı (F2-F1), y hücre merkezine uzaklık. */
vec2 worley(vec2 p, float per) {
  vec2 i = floor(p), f = p - i;
  float f1 = 9.0, f2 = 9.0;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 g = vec2(float(x), float(y));
    float d = length(g + cellPoint(i + g, per) - f);
    if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) f2 = d;
  }
  return vec2(f2 - f1, f1);
}
float pfbm(vec2 p, float per) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) {
    vec2 ip = floor(p), f = p - ip;
    f = f * f * (3.0 - 2.0 * f);
    float v = mix(mix(hash21(mod(ip, per)), hash21(mod(ip + vec2(1, 0), per)), f.x),
                  mix(hash21(mod(ip + vec2(0, 1), per)), hash21(mod(ip + vec2(1, 1), per)), f.x), f.y);
    s += a * v; a *= 0.5; p *= 2.0; per *= 2.0;
  }
  return s;
}
void main() {
  vec2 uv = gl_FragCoord.xy / uSize;
  vec2 warp = vec2(pfbm(uv * 8.0, 8.0), pfbm(uv * 8.0 + 3.7, 8.0)) - 0.47;
  vec2 p = uv + warp * 0.05;
  // Köpük dolgu değil AĞDIR: kabarcık duvarları hücre kenarlarında toplanır.
  float a = 1.0 - smoothstep(0.015, 0.2, worley(p * 9.0, 9.0).x);
  float b = 1.0 - smoothstep(0.01, 0.16, worley(p * 23.0 + 5.0, 23.0).x);
  float c = 1.0 - smoothstep(0.01, 0.14, worley(p * 58.0 + 9.0, 58.0).x);
  float lace = clamp(a * 0.62 + b * 0.5 + c * 0.32, 0.0, 1.0);
  float body = pfbm(uv * 16.0 + 2.0, 16.0);
  o = vec4(lace, body, 0.0, 1.0);
}`;

/** Karadan denize işaretli uzaklık: kara hücreleri negatif (dünya birimi). */
export function signedCoast(cache) {
  const { w, h, toLand, width } = cache;
  const dx = width / w;
  const out = new Float32Array(w * h);
  const INF = 1e6;
  for (let i = 0; i < out.length; i++) out[i] = toLand[i] > 0 ? 0 : INF;
  const d1 = dx;
  const d2 = dx * Math.SQRT2;
  const relax = (i, j, c) => { if (out[j] + c < out[i]) out[i] = out[j] + c; };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (out[i] === 0) continue;
      const l = (x - 1 + w) % w;
      relax(i, y * w + l, d1);
      if (y > 0) {
        relax(i, (y - 1) * w + x, d1);
        relax(i, (y - 1) * w + l, d2);
        relax(i, (y - 1) * w + (x + 1) % w, d2);
      }
    }
  }
  for (let y = h - 1; y >= 0; y--) {
    for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x;
      if (out[i] === 0) continue;
      const r = (x + 1) % w;
      relax(i, y * w + r, d1);
      if (y < h - 1) {
        relax(i, (y + 1) * w + x, d1);
        relax(i, (y + 1) * w + r, d2);
        relax(i, (y + 1) * w + (x - 1 + w) % w, d2);
      }
    }
  }
  for (let i = 0; i < out.length; i++) out[i] = toLand[i] > 0 ? toLand[i] : -out[i];
  return out;
}

/** Kıyı alanının kaba rastere göre inceltilmesi (eksen başına). */
const COAST_FINE = 2;
/** Kesin uzaklığın hesaplandığı şerit (ince teksel). */
const COAST_REACH = 4;

/**
 * Kıyı eğrisine kesin işaretli uzaklık. Kaba kara maskesi hex başına dört teksellik ikili
 * rasterdir: deniz karayı onun basamaklarında kesiyor, kıvrımlı kıyı çizgisinin altında
 * dolgu dümdüz yatay ve dikey kenarlarla bitiyordu. Şerit dışı kaba alandan büyütülür.
 */
function preciseCoast(cache) {
  const coarse = signedCoast(cache);
  const { w, h, width, height, x0, y0, world } = cache;
  const W = w * COAST_FINE;
  const H = h * COAST_FINE;
  const dx = width / W;
  const dy = height / H;
  const out = new Float32Array(W * H);
  for (let j = 0; j < H; j++) {
    const v = (j + 0.5) / COAST_FINE - 0.5;
    const iy = Math.floor(v);
    const fy = v - iy;
    const y0i = Math.max(0, iy);
    const y1i = Math.min(h - 1, iy + 1);
    for (let i = 0; i < W; i++) {
      const u = (i + 0.5) / COAST_FINE - 0.5;
      const ix = Math.floor(u);
      const fx = u - ix;
      const x0i = (ix + w) % w;
      const x1i = (ix + 1) % w;
      const a = coarse[y0i * w + x0i] + (coarse[y0i * w + x1i] - coarse[y0i * w + x0i]) * fx;
      const b = coarse[y1i * w + x0i] + (coarse[y1i * w + x1i] - coarse[y1i * w + x0i]) * fx;
      out[j * W + i] = a + (b - a) * fy;
    }
  }

  const near = new Float32Array(W * H).fill(Infinity);
  const reach = Math.max(dx, dy) * COAST_REACH;
  const mesh = coastMesh(world);
  for (const ch of mesh.chains) {
    // Harita kenarı zinciri yumuşatılmaz: orada kıyı yok.
    if (ch.cls !== LINE_COAST || ch.S === ch.H) continue;
    const S = ch.S;
    const n = S.length / 2;
    const segs = ch.closed ? n : n - 1;
    for (let k = 0; k < segs; k++) {
      const m = (k + 1) % n;
      const ax = S[k * 2];
      const ay = S[k * 2 + 1];
      const ex = S[m * 2] - ax;
      const ey = S[m * 2 + 1] - ay;
      const ee = ex * ex + ey * ey;
      const i0 = Math.floor((Math.min(ax, ax + ex) - reach - x0) / dx);
      const i1 = Math.ceil((Math.max(ax, ax + ex) + reach - x0) / dx);
      const j0 = Math.max(0, Math.floor((Math.min(ay, ay + ey) - reach - y0) / dy));
      const j1 = Math.min(H - 1, Math.ceil((Math.max(ay, ay + ey) + reach - y0) / dy));
      for (let j = j0; j <= j1; j++) {
        const py = y0 + (j + 0.5) * dy - ay;
        for (let i = i0; i <= i1; i++) {
          // Zincir açılmış koordinattadır: teksel konumu zincirle aynı turda alınır.
          const px = x0 + (i + 0.5) * dx - ax;
          const t = ee > 1e-9 ? Math.max(0, Math.min(1, (px * ex + py * ey) / ee)) : 0;
          const qx = px - ex * t;
          const qy = py - ey * t;
          const d = qx * qx + qy * qy;
          const o = j * W + (((i % W) + W) % W);
          if (d < near[o]) near[o] = d;
        }
      }
    }
  }
  const limit = reach * reach;
  for (let j = 0; j < H; j++) {
    const y = y0 + (j + 0.5) * dy;
    for (let i = 0; i < W; i++) {
      const o = j * W + i;
      if (near[o] > limit) continue;
      const d = Math.sqrt(near[o]);
      out[o] = smoothLandAt(mesh, x0 + (i + 0.5) * dx, y) ? -d : d;
    }
  }
  return { data: out, w: W, h: H };
}

export class OceanBake {
  constructor(kit) {
    this.kit = kit;
    this.P = {
      bathy: kit.program('pisir.taban', BATHY_FRAG),
      macro: kit.program('pisir.genis', MACRO_FRAG),
      foam: kit.program('pisir.kopuk', FOAM_TEX_FRAG),
    };
    this.bathy = null;
    this.macro = null;
    this.foam = null;
    this.bakeFoam();
  }

  bakeFoam() {
    const { kit } = this;
    const S = 1024;
    this.foam = kit.texture(S, S, 'rgba8', { filter: 'linear', wrapX: 'repeat', mips: true, aniso: true });
    const t = kit.target(S, S, this.foam);
    kit.run(this.P.foam, t, { uSize: [S, S] });
    kit.mips(this.foam);
  }

  /** Dünya değişince taban ve geniş alan yeniden pişer. */
  bakeWorld(cache, hexStep) {
    const { kit } = this;
    const { gl } = kit;
    const signed = preciseCoast(cache);
    const coast = kit.texture(signed.w, signed.h, 'r16f', {
      data: signed.data, format: gl.RED, type: gl.FLOAT, filter: 'linear', wrapX: 'repeat', wrapY: 'clamp',
    });
    const W = 1600;
    const H = Math.round((W * cache.height) / cache.width);
    if (!this.bathy) {
      this.bathy = kit.texture(W, H, 'rgba16f', {
        filter: 'linear', wrapX: 'repeat', wrapY: 'clamp', mips: true, aniso: true,
      });
      this.bathyTarget = kit.target(W, H, this.bathy);
      this.macro = kit.texture(1024, 512, 'rgba16f', {
        filter: 'linear', wrapX: 'repeat', wrapY: 'repeat', mips: true,
      });
      this.macroTarget = kit.target(1024, 512, this.macro);
    }
    const aspect = cache.height / cache.width;
    kit.run(this.P.bathy, this.bathyTarget, { uSize: [W, H], uHex: hexStep, uAspect: aspect }, { uCoast: coast });
    kit.mips(this.bathy);
    kit.run(this.P.macro, this.macroTarget, { uSize: [1024, 512] });
    kit.mips(this.macro);
    gl.deleteTexture(coast);
  }
}
