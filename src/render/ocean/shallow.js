// Sığ su çözücüsü: Navier-Stokes'un derinlik ortalamalı (Saint-Venant) biçimi.
//
// Kurganov-Petrova merkezi-rüzgâraltı şeması: dalga cephesi kıyıda dikleşip bora
// dönüşür, kırılma buradan KENDİLİĞİNDEN çıkar; "köpük şeridi" çizilmez, akışın
// sıkıştığı yerde doğar ve akıntıyla sürüklenir. Şema kuru/ıslak sınırda da
// kararlıdır, bu yüzden su kumsala tırmanıp geri çekilebilir.
//
// Alan kameranın altında durur ve kamerayla kayar. Dalgalar açık deniz tarafındaki
// sünger bölgesinden girer: orada durum, kıyıya doğru yürüyen çözümlü bir dalga
// katarına çekilir. Simülasyon durumu oyuna hiç yazılmaz; yalnız görüntüdür.

const HEAD = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
`;

/** Bir teksel dünya birimi: kamera yaklaştıkça çözünürlük artar. */
const LEVELS = [1.25, 2.5, 3.75];
const METERS = 2;
/** Süngerin beklediği derinlik: açık su sığ su denkleminde hep bu derinlikte yürür. */
const H0 = 26;
const DT = 1 / 40;
const MAX_HULLS = 8;

const BED_FRAG = `${HEAD}
out vec4 o;
uniform sampler2D uBathy, uFoamTex;
uniform vec4 uField, uRect;
uniform float uN;
void main() {
  vec2 p = gl_FragCoord.xy / uN;
  vec2 w = uRect.xy + p * uRect.zw;
  vec4 b = texture(uBathy, (w - uField.xy) / uField.zw);
  float depth = b.r;
  float bed = depth > 0.0 ? -min(depth, ${H0.toFixed(1)}) : -depth;
  float sponge = smoothstep(18.0, 24.0, depth);
  // Kenar teksellerinde de sünger: kamera kayınca açılan şerit temiz başlasın.
  vec2 e = min(p, 1.0 - p) * uN;
  float edge = 1.0 - smoothstep(4.0, 22.0, min(e.x, e.y));
  sponge = max(sponge, edge * step(0.0, b.b));
  float along = texture(uFoamTex, w / 1370.0).g;
  o = vec4(bed, sponge, b.b, along);
}`;

const STEP_FRAG = `${HEAD}
layout(location = 0) out vec4 o;
uniform sampler2D uQ0, uQ, uBed;
uniform float uDx, uDt, uTime, uFoamDecay, uForce;
uniform int uStage, uN, uHullN;
uniform vec4 uHulls[${MAX_HULLS}];
const float G = 9.81;
const float EPS4 = 1.6e-7;

ivec2 cl(ivec2 p) { return clamp(p, ivec2(0), ivec2(uN - 1)); }
vec3 q(ivec2 p) { return texelFetch(uQ, cl(p), 0).rgb; }
float bed(ivec2 p) { return texelFetch(uBed, cl(p), 0).r; }

float mm(float a, float b, float c) {
  if (a > 0.0 && b > 0.0 && c > 0.0) return min(a, min(b, c));
  if (a < 0.0 && b < 0.0 && c < 0.0) return max(a, max(b, c));
  return 0.0;
}
vec3 limited(vec3 a, vec3 b, vec3 c) {
  const float T = 1.3;
  return vec3(mm(T * (b.x - a.x), 0.5 * (c.x - a.x), T * (c.x - b.x)),
              mm(T * (b.y - a.y), 0.5 * (c.y - a.y), T * (c.y - b.y)),
              mm(T * (b.z - a.z), 0.5 * (c.z - a.z), T * (c.z - b.z)));
}
vec3 flux(vec3 s, float Bf, bool xAxis, out float un, out float c) {
  float h = max(s.x - Bf, 0.0);
  float h4 = h * h * h * h;
  float k = 1.41421356 * h / sqrt(h4 + max(h4, EPS4));
  float u = k * s.y, v = k * s.z;
  c = sqrt(G * h);
  float p = 0.5 * G * h * h;
  if (xAxis) { un = u; return vec3(h * u, h * u * u + p, h * u * v); }
  un = v;
  return vec3(h * v, h * u * v, h * v * v + p);
}
vec3 faceFlux(ivec2 i, ivec2 e, bool xAxis) {
  vec3 a = q(i - e), b = q(i), c = q(i + e), d = q(i + e + e);
  vec3 L = b + 0.5 * limited(a, b, c);
  vec3 R = c - 0.5 * limited(b, c, d);
  float Bf = 0.5 * (bed(i) + bed(i + e));
  L.x = max(L.x, Bf);
  R.x = max(R.x, Bf);
  float uL, cL, uR, cR;
  vec3 FL = flux(L, Bf, xAxis, uL, cL);
  vec3 FR = flux(R, Bf, xAxis, uR, cR);
  float ap = max(max(uL + cL, uR + cR), 0.0);
  float am = min(min(uL - cL, uR - cR), 0.0);
  float span = ap - am;
  if (span < 1e-5) return vec3(0.0);
  return (ap * FL - am * FR + ap * am * (R - L)) / span;
}
vec3 rhs(ivec2 p) {
  vec3 s = q(p);
  float B = bed(p);
  float h = max(s.x - B, 0.0);
  ivec2 ex = ivec2(1, 0), ey = ivec2(0, 1);
  vec3 dF = faceFlux(p, ex, true) - faceFlux(p - ex, ex, true);
  vec3 dG = faceFlux(p, ey, false) - faceFlux(p - ey, ey, false);
  vec3 r = -(dF + dG) / uDx;
  r.y -= G * h * 0.5 * (bed(p + ex) - bed(p - ex)) / uDx;
  r.z -= G * h * 0.5 * (bed(p + ey) - bed(p - ey)) / uDx;
  return r;
}
float foamAt(vec2 p) {
  vec2 f = p - 0.5;
  ivec2 i = ivec2(floor(f));
  f -= floor(f);
  return mix(mix(texelFetch(uQ0, cl(i), 0).a, texelFetch(uQ0, cl(i + ivec2(1, 0)), 0).a, f.x),
             mix(texelFetch(uQ0, cl(i + ivec2(0, 1)), 0).a, texelFetch(uQ0, cl(i + ivec2(1, 1)), 0).a, f.x), f.y);
}
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  vec4 q0 = texelFetch(uQ0, p, 0);
  vec4 bd = texelFetch(uBed, p, 0);
  float B = bd.r;
  vec3 s = q(p) + uDt * rhs(p);
  if (uStage == 1) { o = vec4(s, q0.a); return; }
  s = 0.5 * (q0.rgb + s);

  // Dipte sürtünme (Manning): tırmanan dil kumda yavaşlar.
  float h = max(s.x - B, 0.0);
  if (h < 0.015) { s = vec3(max(s.x, B), 0.0, 0.0); h = max(s.x - B, 0.0); }
  else {
    float sp = length(s.yz) / h;
    s.yz /= 1.0 + uDt * G * 0.0009 * sp / pow(h, 1.3333);
    float cap = 11.0 * h;
    float m = length(s.yz);
    if (m > cap) s.yz *= cap / m;
  }

  // Kıyıya yürüyen dalga katarı. Evre kıyı uzaklığından gelir: cephe her kıyıya
  // paralel iner ve rüzgâr altı kıyı da dalga alır.
  // uForce: alan yeni kurulurken dalga her yere bir kerede yazılır. Yoksa açıktan
  // kıyıya ilk cephenin varması bir dakika sürer ve kıyı o süre boş kalır.
  float sponge = max(bd.g, uForce);
  if (sponge > 0.001) {
    float sd = bd.b * ${METERS.toFixed(1)};
    float c0 = sqrt(G * ${H0.toFixed(1)});
    float nA = bd.a;
    float warp = (nA - 0.47) * 120.0;
    float env = mix(0.55, 1.35, smoothstep(0.3, 0.7, nA));
    float eta = 0.0;
    float T1 = 9.3, T2 = 7.1, T3 = 12.4;
    float w1 = 6.2831853 / T1, w2 = 6.2831853 / T2, w3 = 6.2831853 / T3;
    eta += 0.62 * sin(w1 * uTime + w1 / c0 * (sd + warp));
    eta += 0.34 * sin(w2 * uTime + w2 / c0 * (sd + warp * 1.3) + 1.7);
    eta += 0.40 * sin(w3 * uTime + w3 / c0 * (sd + warp * 0.8) + 4.1);
    eta *= env;
    // Green yasası: sığlıkta genlik büyür; kırılma sınırının altında tutulur.
    float hLocal = max(-B, 0.0);
    eta *= pow(${H0.toFixed(1)} / max(hLocal, 1.0), 0.25);
    eta = clamp(eta, -0.55 * hLocal, 0.55 * hLocal);
    float gx = texelFetch(uBed, cl(p + ivec2(1, 0)), 0).b - texelFetch(uBed, cl(p - ivec2(1, 0)), 0).b;
    float gy = texelFetch(uBed, cl(p + ivec2(0, 1)), 0).b - texelFetch(uBed, cl(p - ivec2(0, 1)), 0).b;
    vec2 toShore = -normalize(vec2(gx, gy) + 1e-5);
    float flow = eta * sqrt(G * max(hLocal, 0.05));
    vec3 target = vec3(max(eta, B), toShore * flow * step(0.05, hLocal));
    s = mix(s, target, uForce > 0.5 ? 1.0 : sponge * (1.0 - exp(-uDt / 0.55)));
  }

  // Gemi: gövde suyu iter, önünde kabarma arkasında çukur açar.
  float hullFoam = 0.0;
  for (int i = 0; i < uHullN; i++) {
    vec4 hull = uHulls[i];
    vec2 d = vec2(p) + 0.5 - hull.xy;
    float sp = max(length(hull.zw), 1e-3);
    vec2 fwd = hull.zw / sp;
    float along = dot(d, fwd);
    float cross_ = dot(d, vec2(-fwd.y, fwd.x));
    float g = exp(-(along * along / 90.0 + cross_ * cross_ / 11.0));
    s.x += uDt * g * (along / 9.0) * min(sp, 9.0) * 0.9;
    s.yz += uDt * g * hull.zw * 1.4 * max(h, 0.5);
    float aft = exp(-pow((along + 7.0) / 9.0, 2.0) - cross_ * cross_ / 2.2);
    hullFoam = max(hullFoam, aft * smoothstep(0.5, 3.0, sp));
  }

  // Köpük akışla taşınır (yarı-Lagrange) ve yavaşça çözülür.
  vec2 vel = h > 0.03 ? s.yz / h : vec2(0.0);
  // Sığ resifte köpük hızlı erir: sürekli kırılan bank beyaz leke kalmasın.
  vec2 back = vec2(p) + 0.5 - vel * uDt / uDx;
  float foam = mix(foamAt(back), 0.25 * (foamAt(back + vec2(1.6, 0.0)) + foamAt(back - vec2(1.6, 0.0))
    + foamAt(back + vec2(0.0, 1.6)) + foamAt(back - vec2(0.0, 1.6))), 0.1) * uFoamDecay;
  foam *= mix(0.975, 1.0, smoothstep(0.6, 3.5, h));

  // Kırılma: yüzey hızla yükseliyorsa (bora) ya da akış dalga hızını aşıyorsa.
  float rise = (s.x - q0.r) / uDt;
  float fr = length(vel) / max(sqrt(G * h), 0.2);
  // Cephe gelmeden kırılma olmaz: resif içindeki sakin akış köpük üretmesin.
  float born = smoothstep(1.1, 3.2, rise) * (0.55 + 0.45 * smoothstep(0.6, 1.1, fr));
  // Sünger içinde dalga zorla yazılır; oradaki sıçrama kırılma değildir.
  born *= 1.0 - smoothstep(0.02, 0.3, sponge);
  o = vec4(s, clamp(max(foam, born * 0.62 * step(0.02, h)) + hullFoam * uDt * 2.4 * max(0.42 - foam, 0.0), 0.0, 1.0));
}`;

const SHIFT_FRAG = `${HEAD}
out vec4 o;
uniform sampler2D uQ, uBed;
uniform ivec2 uShift;
uniform int uN;
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  ivec2 s = p + uShift;
  float B = texelFetch(uBed, p, 0).r;
  if (s.x < 0 || s.y < 0 || s.x >= uN || s.y >= uN) { o = vec4(max(B, 0.0), 0.0, 0.0, 0.0); return; }
  o = texelFetch(uQ, s, 0);
  o.r = max(o.r, B);
}`;

const OUT_FRAG = `${HEAD}
out vec4 o;
uniform sampler2D uQ, uBed;
uniform float uDx;
uniform int uN, uHullN;
uniform vec4 uHulls[${MAX_HULLS}];
ivec2 cl(ivec2 p) { return clamp(p, ivec2(0), ivec2(uN - 1)); }
float surf(ivec2 p) {
  vec4 q = texelFetch(uQ, cl(p), 0);
  return q.r;
}
// Kelvin izi: arkada enine dalgalar, ±19,5° kolda ıraksak sırtlar. Sığ su
// denklemi dağılmasızdır, bu deseni kendiliğinden üretemez; biçim derin su
// çözümünden gelir, tek ölçeği geminin hızıdır (λ = 2π v² / g).
float kelvin(vec2 d, vec2 fwd, float sp) {
  float a = -dot(d, fwd);
  float b = dot(d, vec2(-fwd.y, fwd.x));
  if (a < 1.0 || a > 620.0 || abs(b) > a * 0.42) return 0.0;
  float v = clamp(sp, 3.0, 7.5);
  float k = 9.81 / (v * v);
  float edge = abs(b) / (a * 0.3535);
  float fade = smoothstep(1.16, 0.9, edge) * smoothstep(2.0, 26.0, a) * exp(-a / 300.0);
  float along = cos(k * a * (1.0 - 0.28 * edge * edge)) * (1.0 - smoothstep(0.55, 0.95, edge)) * 0.5;
  float arms = sin(k * 2.1 * (a * 0.58 + abs(b) * 0.81)) * smoothstep(0.5, 0.95, edge);
  return (along + arms) * fade * 0.62;
}
float wakeAt(vec2 p) {
  float h = 0.0;
  for (int i = 0; i < uHullN; i++) {
    float sp = length(uHulls[i].zw);
    if (sp < 1.0) continue;
    h += kelvin((p - uHulls[i].xy) * uDx, uHulls[i].zw / sp, sp);
  }
  return h;
}
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  vec4 q = texelFetch(uQ, p, 0);
  float B = texelFetch(uBed, p, 0).r;
  float h = max(q.r - B, 0.0);
  vec2 s = vec2(surf(p + ivec2(1, 0)) - surf(p - ivec2(1, 0)),
                surf(p + ivec2(0, 1)) - surf(p - ivec2(0, 1))) / (2.0 * uDx);
  // Kuru hücrenin "yüzeyi" tabandır: kumsal eğimi su eğimi sanılmasın.
  float wet = smoothstep(0.02, 0.12, h);
  // Sığ su dalgası yalnız şelfte görünür; açık denizin dalgasını FFT taşır.
  s *= wet * (1.0 - smoothstep(13.0, 23.0, -B));
  if (uHullN > 0) {
    vec2 c = vec2(p) + 0.5;
    s += vec2(wakeAt(c + vec2(1.0, 0.0)) - wakeAt(c - vec2(1.0, 0.0)),
              wakeAt(c + vec2(0.0, 1.0)) - wakeAt(c - vec2(0.0, 1.0))) / (2.0 * uDx);
  }
  o = vec4(clamp(s, -1.4, 1.4), q.a, wet);
}`;

export class ShallowSolver {
  constructor(kit, bake, N = 512) {
    this.kit = kit;
    this.bake = bake;
    this.N = N;
    this.P = {
      bed: kit.program('sig.taban', BED_FRAG),
      step: kit.program('sig.adim', STEP_FRAG),
      shift: kit.program('sig.kaydir', SHIFT_FRAG),
      out: kit.program('sig.cikti', OUT_FRAG),
    };
    const state = () => {
      const tex = kit.texture(N, N, 'rgba32f');
      return { tex, target: kit.target(N, N, tex) };
    };
    this.Q = [state(), state(), state()];
    this.bed = kit.texture(N, N, 'rgba16f');
    this.bedTarget = kit.target(N, N, this.bed);
    this.output = kit.texture(N, N, 'rgba16f', { filter: 'linear', mips: true });
    this.outputTarget = kit.target(N, N, this.output);
    this.dx = 0;
    this.ox = 0;
    this.oy = 0;
    this.fade = 0;
    this.spin = 0;
    this.acc = 0;
    this.simTime = 0;
    this.active = false;
    this.hulls = [];
    this.hullData = new Float32Array(MAX_HULLS * 4);
  }

  /** Dünya dikdörtgeni: gölgelendirici bununla örnekler. */
  get rect() {
    const span = this.N * this.dx;
    return [this.ox * this.dx, this.oy * this.dx, span, span];
  }

  bakeBed() {
    const { kit, bake, N } = this;
    kit.run(this.P.bed, this.bedTarget, { uField: this.field, uRect: this.rect, uN: N }, {
      uBathy: bake.bathy, uFoamTex: bake.foam,
    });
  }

  restart(cx, cy) {
    const { kit, N } = this;
    this.ox = Math.floor(cx / this.dx) - N / 2;
    this.oy = Math.floor(cy / this.dx) - N / 2;
    this.bakeBed();
    kit.run(this.P.shift, this.Q[0].target, { uShift: [N * 4, 0], uN: N }, { uQ: this.Q[1].tex, uBed: this.bed });
    this.stepOnce(1);
    this.spin = 120;
    this.fade = 0;
  }

  recenter(cx, cy, wrap) {
    const { kit, N } = this;
    const tx = Math.floor(cx / this.dx) - N / 2;
    const ty = Math.floor(cy / this.dx) - N / 2;
    let sx = tx - this.ox;
    const sy = ty - this.oy;
    if (wrap && Math.abs(sx) > N / 2) {
      const per = Math.round(wrap / this.dx);
      sx -= Math.round(sx / per) * per;
    }
    if (Math.abs(sx) > N / 2 || Math.abs(sy) > N / 2) return this.restart(cx, cy);
    if (Math.abs(sx) < 10 && Math.abs(sy) < 10) return undefined;
    this.ox = tx;
    this.oy = ty;
    this.bakeBed();
    kit.run(this.P.shift, this.Q[1].target, { uShift: [sx, sy], uN: N }, { uQ: this.Q[0].tex, uBed: this.bed });
    [this.Q[0], this.Q[1]] = [this.Q[1], this.Q[0]];
    return undefined;
  }

  stepOnce(force = 0) {
    const { kit, N } = this;
    const base = {
      uDx: this.dx * METERS, uDt: DT, uTime: this.simTime, uN: N, uForce: force,
      uFoamDecay: Math.exp(-DT / 8.5), uHullN: this.hulls.length, uHulls: this.hullData,
    };
    kit.run(this.P.step, this.Q[1].target, { ...base, uStage: 1 }, {
      uQ0: this.Q[0].tex, uQ: this.Q[0].tex, uBed: this.bed,
    });
    kit.run(this.P.step, this.Q[2].target, { ...base, uStage: 2 }, {
      uQ0: this.Q[0].tex, uQ: this.Q[1].tex, uBed: this.bed,
    });
    [this.Q[0], this.Q[2]] = [this.Q[2], this.Q[0]];
    this.simTime += DT;
  }

  /** Görünür alana sığan en ince seviye; kamera çok uzaktaysa çözücü uyur. */
  levelFor(cam) {
    const need = (cam.viewWidth / cam.zoom) * 1.08 / this.N;
    return LEVELS.find((l) => l >= need) ?? 0;
  }

  update(cam, dt, field, wrap, ships) {
    this.field = field;
    const level = this.levelFor(cam);
    if (!level) {
      this.fade = Math.max(0, this.fade - dt * 1.4);
      this.active = this.fade > 0;
      return;
    }
    if (level !== this.dx) {
      this.dx = level;
      this.restart(cam.x, cam.y);
    } else {
      this.recenter(cam.x, cam.y, wrap);
    }
    this.active = true;
    this.setHulls(ships);
    // Kıyıya dalga varana dek görüntü verilmez: boş denizden birden belirmesin.
    if (this.spin > 0) {
      for (let i = 0; i < 5; i++) this.stepOnce();
      this.spin -= 5;
    } else {
      this.acc = Math.min(this.acc + dt, DT * 3);
      while (this.acc >= DT) { this.stepOnce(); this.acc -= DT; }
      this.fade = Math.min(1, this.fade + dt / 1.8);
    }
    this.kit.run(this.P.out, this.outputTarget, {
      uDx: this.dx * METERS, uN: this.N, uHullN: this.hulls.length, uHulls: this.hullData,
    }, { uQ: this.Q[0].tex, uBed: this.bed });
    this.kit.mips(this.output);
  }

  setHulls(ships) {
    this.hulls = [];
    if (!ships?.length) return;
    for (const s of ships) {
      if (this.hulls.length >= MAX_HULLS) break;
      const x = s.x / this.dx - this.ox;
      const y = s.y / this.dx - this.oy;
      if (x < 0 || y < 0 || x >= this.N || y >= this.N) continue;
      const i = this.hulls.length * 4;
      this.hullData[i] = x;
      this.hullData[i + 1] = y;
      this.hullData[i + 2] = s.vx * METERS;
      this.hullData[i + 3] = s.vy * METERS;
      this.hulls.push(s);
    }
  }
}
