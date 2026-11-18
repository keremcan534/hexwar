// Bir dalga kaskadı: tayf → FFT → çözülmüş eğim dokuları + biriken köpük.
//
// Çıktı doğrudan LEAN haritalamaya hazırdır: A dokusu eğimin ortalamasını,
// B dokusu ikinci momentlerini taşır. Mipmap ortalaması momentleri doğru
// topladığı için uzaklaştıkça piksel altına inen dalga kaybolmaz, pürüzlülüğe
// dönüşür; kırpışma yerine güneş parıltısı genişler.

import { G, buildH0 } from './spectrum.js';

/** Zamanın döndüğü periyot (sn): float hassasiyeti saatlerce oynanınca da kalsın. */
export const LOOP_SECONDS = 1024;

const HEAD = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
`;

const TIME_FRAG = `${HEAD}
layout(location = 0) out vec4 o0;
layout(location = 1) out vec4 o1;
uniform sampler2D uH0;
uniform float uTime, uL;
uniform int uN;
const float TAU = 6.283185307179586;
vec2 cmul(vec2 a, vec2 b) { return vec2(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x); }
vec2 I(vec2 a) { return vec2(-a.y, a.x); }
void main() {
  ivec2 t = ivec2(gl_FragCoord.xy);
  vec2 n = vec2(t.x < uN / 2 ? t.x : t.x - uN, t.y < uN / 2 ? t.y : t.y - uN);
  vec2 k = TAU * n / uL;
  float kl = length(k);
  if (kl < 1e-6) { o0 = vec4(0.0); o1 = vec4(0.0); return; }
  // Frekans döngü periyoduna kuantalanır: zaman sarınca faz sıçramaz.
  float w0 = TAU / ${LOOP_SECONDS.toFixed(1)};
  float w = floor(sqrt(${G.toFixed(4)} * kl) / w0 + 0.5) * w0;
  vec4 h0 = texelFetch(uH0, t, 0);
  float c = cos(w * uTime), s = sin(w * uTime);
  vec2 H = cmul(h0.xy, vec2(c, s)) + cmul(h0.zw, vec2(c, -s));
  vec2 kn = k / kl;
  vec2 mI = vec2(H.y, -H.x);            // -i H
  vec2 Dx = kn.x * mI;
  vec2 Dz = kn.y * mI;
  vec2 Ex = k.x * I(H);                 // dh/dx
  vec2 Ez = k.y * I(H);                 // dh/dz
  vec2 Dxx = k.x * kn.x * H;
  vec2 Dzz = k.y * kn.y * H;
  vec2 Dxz = k.x * kn.y * H;
  // Uzaysal alanlar gerçek olduğundan iki alan tek karmaşık kanala sığar:
  // C = A + iB. Sekiz alan böylece iki RGBA dokusunda taşınır.
  o0 = vec4(H + I(Dx), Dz + I(Ex));
  o1 = vec4(Ez + I(Dxx), Dzz + I(Dxz));
}`;

const FFT_FRAG = `${HEAD}
layout(location = 0) out vec4 o0;
layout(location = 1) out vec4 o1;
uniform sampler2D uA, uB;
uniform int uSub, uAxis, uN;
const float TAU = 6.283185307179586;
vec2 cmul(vec2 a, vec2 b) { return vec2(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x); }
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  int idx = uAxis == 0 ? p.x : p.y;
  int half_ = uSub / 2;
  // Stockham: bit ters çevirme geçişi yok, girdi ve çıktı doğal sırada.
  int even = (idx / uSub) * half_ + (idx % half_);
  int odd = even + uN / 2;
  ivec2 e = uAxis == 0 ? ivec2(even, p.y) : ivec2(p.x, even);
  ivec2 d = uAxis == 0 ? ivec2(odd, p.y) : ivec2(p.x, odd);
  float a = TAU * float(idx) / float(uSub);
  vec2 w = vec2(cos(a), sin(a));
  vec4 ea = texelFetch(uA, e, 0), oa = texelFetch(uA, d, 0);
  vec4 eb = texelFetch(uB, e, 0), ob = texelFetch(uB, d, 0);
  o0 = vec4(ea.xy + cmul(w, oa.xy), ea.zw + cmul(w, oa.zw));
  o1 = vec4(eb.xy + cmul(w, ob.xy), eb.zw + cmul(w, ob.zw));
}`;

// Yatay çırpıntı geometriye değil ALANA işlenir: tepeden bakan kamerada ağ
// yer değiştirmesi görünmez, görünen tek şey tepenin sivrilmesidir. Ters
// eşleme burada bir kez çözülünce ekran geçişi ek örnek ödemez.
const RESOLVE_FRAG = `${HEAD}
layout(location = 0) out vec4 o0;
layout(location = 1) out vec4 o1;
uniform sampler2D uA, uB;
uniform int uN;
uniform float uChop, uTexel;
vec4 fetch(sampler2D t, ivec2 p) { return texelFetch(t, ivec2(p.x & (uN - 1), p.y & (uN - 1)), 0); }
vec4 bilerp(sampler2D t, vec2 p) {
  vec2 f = p - 0.5;
  ivec2 i = ivec2(floor(f));
  f -= floor(f);
  return mix(mix(fetch(t, i), fetch(t, i + ivec2(1, 0)), f.x),
             mix(fetch(t, i + ivec2(0, 1)), fetch(t, i + ivec2(1, 1)), f.x), f.y);
}
void main() {
  vec2 p = gl_FragCoord.xy;
  vec2 q = p;
  for (int i = 0; i < 2; i++) {
    vec4 a = bilerp(uA, q);
    q = p - vec2(a.y, a.z) * uChop / uTexel;
  }
  vec4 a = bilerp(uA, q);
  vec4 b = bilerp(uB, q);
  float eta = a.x;
  float ex = a.w, ez = b.x;
  float dxx = uChop * b.y, dzz = uChop * b.z, dxz = uChop * b.w;
  float jx = 1.0 + dxx, jz = 1.0 + dzz;
  float J = jx * jz - dxz * dxz;
  float safeJ = max(J, 0.3);
  vec2 s = vec2(ex * jz - ez * dxz, ez * jx - ex * dxz) / safeJ;
  o0 = vec4(s, eta, J);
  o1 = vec4(s.x * s.x, s.y * s.y, s.x * s.y, 0.0);
}`;

// Köpük sıkışmanın (J < eşik) bıraktığı izdir. Tepe geçince aniden kaybolmaz,
// dünya yerine dalganın kendi karosunda yavaşça çözülür.
const FOAM_FRAG = `${HEAD}
out vec4 o;
uniform sampler2D uPrev, uRes;
uniform float uDecay, uBias, uGain;
uniform vec2 uDrift, uSize;
void main() {
  vec2 uv = gl_FragCoord.xy / uSize;
  float prev = texture(uPrev, uv - uDrift).r;
  float J = texelFetch(uRes, ivec2(gl_FragCoord.xy), 0).a;
  float born = clamp((uBias - J) * uGain, 0.0, 1.0);
  o = vec4(max(prev * uDecay, born), 0.0, 0.0, 1.0);
}`;

export function cascadePrograms(kit) {
  return {
    time: kit.program('dalga.zaman', TIME_FRAG),
    fft: kit.program('dalga.fft', FFT_FRAG),
    resolve: kit.program('dalga.coz', RESOLVE_FRAG),
    foam: kit.program('dalga.kopuk', FOAM_FRAG),
  };
}

export class Cascade {
  /**
   * @param spec { N, lengthUnits, metersPerUnit, kMin, kMax, seed, chop, foam }
   *   lengthUnits karo boyudur (dünya birimi); dünya genişliğini tam bölmeli.
   */
  constructor(kit, programs, spec) {
    this.kit = kit;
    this.P = programs;
    this.spec = spec;
    const { N } = spec;
    this.N = N;
    this.L = spec.lengthUnits;
    this.Lm = spec.lengthUnits * spec.metersPerUnit;
    this.passes = Math.round(Math.log2(N));
    const data = buildH0(N, this.Lm, spec.kMin, spec.kMax, spec.seed);
    this.h0 = kit.texture(N, N, 'rgba32f', { data, format: kit.gl.RGBA, type: kit.gl.FLOAT });
    const raw = () => kit.texture(N, N, 'rgba32f');
    this.pair = [0, 1].map(() => {
      const a = raw();
      const b = raw();
      return { a, b, target: kit.target(N, N, [a, b]) };
    });
    const res = (filter) => kit.texture(N, N, 'rgba16f', {
      filter, wrapX: 'repeat', mips: true, aniso: true,
    });
    this.A = res('linear');
    this.B = res('linear');
    this.resolved = kit.target(N, N, [this.A, this.B]);
    this.foam = null;
    if (spec.foam) {
      this.foam = [0, 1].map(() => {
        const tex = kit.texture(N, N, 'rg16f', { filter: 'linear', wrapX: 'repeat', mips: true });
        return { tex, target: kit.target(N, N, tex) };
      });
      this.foamIdx = 0;
      for (const f of this.foam) {
        kit.gl.bindFramebuffer(kit.gl.FRAMEBUFFER, f.target.fb);
        kit.gl.clearColor(0, 0, 0, 0);
        kit.gl.clear(kit.gl.COLOR_BUFFER_BIT);
      }
    }
    this.lastFoamTime = null;
  }

  get foamTex() {
    return this.foam ? this.foam[this.foamIdx].tex : null;
  }

  /** Bir zaman adımı: tayf, 2·log2(N) FFT geçişi, çözüm, köpük, mipmap. */
  update(time) {
    const { kit, P, N, passes, spec } = this;
    let front = 0;
    kit.run(P.time, this.pair[0].target, { uTime: time, uL: this.Lm, uN: N }, { uH0: this.h0 });
    for (let axis = 0; axis < 2; axis++) {
      for (let i = 1; i <= passes; i++) {
        const back = 1 - front;
        kit.run(P.fft, this.pair[back].target, { uSub: 1 << i, uAxis: axis, uN: N }, {
          uA: this.pair[front].a, uB: this.pair[front].b,
        });
        front = back;
      }
    }
    kit.run(P.resolve, this.resolved, {
      uN: N, uChop: spec.chop, uTexel: this.Lm / N,
    }, { uA: this.pair[front].a, uB: this.pair[front].b });
    kit.mips(this.A);
    kit.mips(this.B);

    if (this.foam) {
      const dt = this.lastFoamTime === null ? 0 : Math.max(0, Math.min(0.25, time - this.lastFoamTime));
      this.lastFoamTime = time;
      const prev = this.foam[this.foamIdx];
      const next = this.foam[1 - this.foamIdx];
      // Köpük rüzgârla sürüklenir: karo boyuna göre uv/sn.
      const drift = 0.6 / this.Lm * dt;
      kit.run(P.foam, next.target, {
        uDecay: Math.exp(-dt / spec.foamLife),
        uBias: spec.foamBias,
        uGain: spec.foamGain,
        uDrift: [drift * Math.cos(0.46), drift * Math.sin(0.46)],
        uSize: [N, N],
      }, { uPrev: prev.tex, uRes: this.A });
      this.foamIdx = 1 - this.foamIdx;
      kit.mips(next.tex);
    }
  }
}

/**
 * Karo boyları dünya genişliğini TAM böler (sarmal dikişi görünmez) ve bölenler
 * asaldır: karoların ortak katı dünya genişliğinin kendisi olur, tekrar deseni
 * ekrana hiç sığmaz.
 */
export function cascadeLayout(wrapWidth, quality) {
  const W = wrapWidth || 7200;
  const fit = (target, prime) => W / Math.max(1, Math.round(W / target / prime) * prime || prime);
  const M = 2;
  const N = quality === 'high' ? 256 : 128;
  const sizes = quality === 'high'
    ? [fit(1029, 7), fit(248, 29), fit(64, 113)]
    : [fit(1029, 7), fit(160, 47)];
  const cuts = [0, 0.137, 0.57, 7];
  const twoCuts = [0, 0.26, 3];
  const k = quality === 'high' ? cuts : twoCuts;
  return sizes.map((lengthUnits, i) => ({
    N,
    lengthUnits,
    metersPerUnit: M,
    kMin: i === 0 ? 2 * (2 * Math.PI) / (lengthUnits * M) : k[i],
    kMax: k[i + 1],
    seed: 90210 + i * 7919,
    chop: [0.9, 1.05, 0.85][i],
    foam: i < 2,
    foamLife: [5.5, 3.4, 1][i],
    foamBias: [0.86, 0.80, 0.5][i],
    foamGain: [3.0, 3.6, 3][i],
  }));
}
