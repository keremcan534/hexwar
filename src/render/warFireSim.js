// Yakın plan yangını: GPU'da çözülen gerçek akışkan.
//
// Gürültü alevi uzakta iyi durur, yakında desen olduğu anlaşılır ve çevresini
// bilmez. Burada sıcaklık, yakıt, kurum ve hız alanı her adımda çözülür: alev
// yakıtın bulunduğu yere yürür, province sınırı duvardır, akış o duvara çarpıp
// kıyı boyunca kayar. Şekli saran biçim çizilmez, denklemden kendiliğinden çıkar.
//
// Bedel sabit tutulur: en çok SIM_SLOTS yangın, her biri RES×RES teksel. Öteki
// yangınlar ve uzak zoom warFxGL'in sıcaklık alanı alevini kullanır.
//
// Katman notu: yalnız GPU'ya dokunur, oyun durumunu okumaz (bkz. warFx.js).

export const SIM_SLOTS = 2;
const RES = 200;
const JACOBI = 8;
/** Sabit adım: kararlılık kare hızına bağlı kalmasın. */
const STEP_SECONDS = 1 / 30;

export function program(gl, vsSource, fsSource) {
  const compile = (type, source) => {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS) && !gl.isContextLost()) {
      console.error('[warFx] gölgelendirici:', gl.getShaderInfoLog(shader));
      return null;
    }
    return shader;
  };
  const vs = compile(gl.VERTEX_SHADER, vsSource);
  const fs = compile(gl.FRAGMENT_SHADER, fsSource);
  if (!vs || !fs) return null;
  const p = gl.createProgram();
  gl.attachShader(p, vs);
  gl.attachShader(p, fs);
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS) && !gl.isContextLost()) {
    console.error('[warFx] bağlama:', gl.getProgramInfoLog(p));
    return null;
  }
  return p;
}

export function uniforms(gl, p, names) {
  const out = {};
  for (const name of names) out[name] = gl.getUniformLocation(p, name);
  return out;
}

/**
 * Gerçek alev görüntüsü: siyah zeminli videonun kareleri (scripts/fx/bake-fire-atlas.mjs).
 * Video baştan sona dönünce sıçrar; iki kopya yarım tur kayık oynar ve her biri
 * başa dönerken görünmezdir, böylece döngü dikişi hiç ekrana gelmez.
 */
export const REAL_FIRE_GLSL = `
uniform sampler2D uAtlas;
vec3 atlasFrame(float ph, vec2 uv) {
  float f = ph * 63.0, i = floor(f), j = min(i + 1.0, 63.0);
  vec2 a = (vec2(mod(i, 8.0), floor(i / 8.0)) + uv) / 8.0;
  vec2 b = (vec2(mod(j, 8.0), floor(j / 8.0)) + uv) / 8.0;
  return mix(texture(uAtlas, a).rgb, texture(uAtlas, b).rgb, f - i);
}
vec4 realFire(vec2 uv, float seed, float time) {
  uv = clamp(uv, 0.004, 0.996);
  float c = time * 0.235 * (0.82 + 0.36 * fract(seed * 7.3)) + seed * 5.0;
  float c2 = c + 0.5;
  vec2 ua = uv, ub = uv;
  if (fract(floor(c) * 0.37 + seed) > 0.5) ua.x = 1.0 - ua.x;
  if (fract(floor(c2) * 0.61 + seed) > 0.5) ub.x = 1.0 - ub.x;
  float w = sin(fract(c) * 3.14159);
  w *= w;
  vec3 col = atlasFrame(fract(c), ua) * w + atlasFrame(fract(c2), ub) * (1.0 - w);
  float lum = max(col.r, max(col.g, col.b));
  // Siyah zemin saydamlığa döner; renk videonun kendi rengidir.
  // Yalnız parlak gövde örter: karenin sönük kenarı örtseydi komşu alevlerin
  // üstünde koyu çerçeve kalır, yangın lav karosu gibi görünürdü.
  float a = smoothstep(0.2, 0.86, lum);
  return vec4(pow(col, vec3(1.22)) * vec3(0.92, 0.8, 0.68), a);
}`;

const PASS_VS = `#version 300 es
layout(location=0) in vec2 aC;
out vec2 vP;
void main() { vP = aC * 0.5 + 0.5; gl_Position = vec4(aC, 0.0, 1.0); }`;

const HEAD = `#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 vP;
out vec4 o;
uniform sampler2D uVel, uHeat, uField, uMask, uN;
uniform vec2 uT;
uniform float uTime, uLevel, uRadius, uSeed;
uniform vec2 uCity;
const float DT = ${STEP_SECONDS.toFixed(5)};
bool solid(vec2 p) { return texture(uMask, p).r < 0.5; }
`;

const PASSES = {
  advectVel: `
void main() {
  if (solid(vP)) { o = vec4(0.0); return; }
  vec2 v = texture(uVel, vP).xy;
  o = vec4(texture(uVel, vP - v * uT).xy * 0.994, 0.0, 1.0);
}`,
  // R sıcaklık, G yakıt, B kurum. Yakıt yerinde durur; ısı akışla taşınır.
  advectHeat: `
void main() {
  if (solid(vP)) { o = vec4(0.0); return; }
  vec2 v = texture(uVel, vP).xy;
  vec2 b = vP - v * uT;
  vec4 h = texture(uHeat, b);
  float around = texture(uHeat, b + vec2(uT.x, 0.0)).r + texture(uHeat, b - vec2(uT.x, 0.0)).r
    + texture(uHeat, b + vec2(0.0, uT.y)).r + texture(uHeat, b - vec2(0.0, uT.y)).r;
  float T = mix(h.r, around * 0.25, 0.42);
  float fuel = texture(uHeat, vP).g;
  float soot = h.b;
  float patchy = texture(uN, vP * 1.3 + vec2(uTime * 0.011, -uTime * 0.008)).r;
  float dist = length(vP - uCity);
  float reach = 1.0 - smoothstep(uRadius * 0.74, uRadius, dist + (patchy - 0.5) * 0.14);
  // Duvara yakınlık: alev kıyıya yığılır, province'in çizgisi ateşle okunur.
  vec2 w = uT * 7.0;
  float wall = 1.0 - min(min(texture(uMask, vP + vec2(w.x, 0.0)).r, texture(uMask, vP - vec2(w.x, 0.0)).r),
                         min(texture(uMask, vP + vec2(0.0, w.y)).r, texture(uMask, vP - vec2(0.0, w.y)).r));
  // Yanan yer yavaşça yeniden tutuşur: yangın tek dalgada bitmez, province içinde dolaşır.
  fuel = min(1.0, fuel + 0.2 * uLevel * reach * smoothstep(0.36, 0.6, patchy) * DT);
  float burn = smoothstep(0.16, 0.34, T) * fuel * reach * (1.0 + wall * 0.9);
  fuel = max(0.0, fuel - burn * 0.62 * DT);
  T += burn * 3.3 * DT;
  T = max(0.0, T - (0.36 + T * T * 0.92) * DT);
  soot = clamp(soot * 0.982 + burn * 0.8 * DT, 0.0, 1.0);
  // Tek noktadan fışkıran kuyruklu yıldız yerine alan boyunca tutuşan kıvılcımlar.
  float spark = texture(uN, vP * 3.1 + vec2(uTime * 0.07, -uTime * 0.16)).g;
  T = max(T, uLevel * smoothstep(0.58, 0.72, spark) * reach * fuel * (0.5 + 0.62 * wall));
  float ember = uLevel * (0.4 + 0.5 * texture(uN, vec2(uTime * 0.21, dist * 3.0)).g);
  T = max(T, ember * (1.0 - smoothstep(uSeed * 0.3, uSeed, dist)));
  o = vec4(T, fuel, soot, 1.0);
}`,
  curl: `
void main() {
  float l = texture(uVel, vP - vec2(uT.x, 0.0)).y, r = texture(uVel, vP + vec2(uT.x, 0.0)).y;
  float b = texture(uVel, vP - vec2(0.0, uT.y)).x, t = texture(uVel, vP + vec2(0.0, uT.y)).x;
  o = vec4(0.5 * ((r - l) - (t - b)), 0.0, 0.0, 1.0);
}`,
  // Kaldırma ekranın yukarısına, girdap güçlendirme dil dil kıvrılmayı korur.
  force: `
void main() {
  if (solid(vP)) { o = vec4(0.0); return; }
  vec2 v = texture(uVel, vP).xy;
  float T = texture(uHeat, vP).r;
  float c = texture(uField, vP).r;
  float l = abs(texture(uField, vP - vec2(uT.x, 0.0)).r), r = abs(texture(uField, vP + vec2(uT.x, 0.0)).r);
  float b = abs(texture(uField, vP - vec2(0.0, uT.y)).r), t = abs(texture(uField, vP + vec2(0.0, uT.y)).r);
  vec2 g = vec2(r - l, t - b);
  g /= max(length(g), 0.0001);
  v += vec2(g.y, -g.x) * c * 7.5 * DT;
  v.y -= T * 1.7 * DT;
  vec2 gust = texture(uN, vP * 2.7 + vec2(uTime * 0.09, uTime * 0.31)).rg - 0.5;
  v += gust * min(T * 2.0, 1.0) * 13.0 * DT;
  o = vec4(v, 0.0, 1.0);
}`,
  // Yanma genleşir: bu kaynak akışı dışa iter ve alevi sınır boyunca yayar.
  divergence: `
float side(vec2 p, vec2 here, int axis) {
  vec2 v = solid(p) ? -here : texture(uVel, p).xy;
  return axis == 0 ? v.x : v.y;
}
void main() {
  vec2 here = texture(uVel, vP).xy;
  float l = side(vP - vec2(uT.x, 0.0), here, 0), r = side(vP + vec2(uT.x, 0.0), here, 0);
  float b = side(vP - vec2(0.0, uT.y), here, 1), t = side(vP + vec2(0.0, uT.y), here, 1);
  vec4 h = texture(uHeat, vP);
  float expand = smoothstep(0.3, 0.8, h.r) * (0.25 + 0.75 * h.g);
  o = vec4(0.5 * (r - l + t - b) - expand * 0.5, 0.0, 0.0, 1.0);
}`,
  jacobi: `
float at(vec2 p, float here) { return solid(p) ? here : texture(uHeat, p).r; }
void main() {
  float c = texture(uHeat, vP).r;
  float sum = at(vP - vec2(uT.x, 0.0), c) + at(vP + vec2(uT.x, 0.0), c)
    + at(vP - vec2(0.0, uT.y), c) + at(vP + vec2(0.0, uT.y), c);
  o = vec4((sum - texture(uField, vP).r) * 0.25, 0.0, 0.0, 1.0);
}`,
  gradient: `
float at(vec2 p, float here) { return solid(p) ? here : texture(uHeat, p).r; }
void main() {
  if (solid(vP)) { o = vec4(0.0); return; }
  float c = texture(uHeat, vP).r;
  vec2 g = vec2(at(vP + vec2(uT.x, 0.0), c) - at(vP - vec2(uT.x, 0.0), c),
                at(vP + vec2(0.0, uT.y), c) - at(vP - vec2(0.0, uT.y), c));
  o = vec4(texture(uVel, vP).xy - 0.5 * g, 0.0, 1.0);
}`,
};

/** Alev dilleri province'in kuzey kıyısını bu kadar aşabilir (alan kenarına oran). */
const RISE = 0.2;

const SHOW_VS = `#version 300 es
precision highp float;
layout(location=0) in vec2 aC;
layout(std140) uniform Frame { mat4 uVP; vec4 uF0; vec4 uF1; };
uniform vec4 uRect;
uniform float uShift;
out vec2 vP;
void main() {
  vP = vec2(aC.x * 0.5 + 0.5, mix(1.0, -${RISE.toFixed(2)}, aC.y * 0.5 + 0.5));
  vec2 w = uRect.xy + vP * uRect.zw;
  gl_Position = uVP * vec4(w.x + uShift, w.y, 0.0, 1.0);
}`;

// Akışkan yangının NEREDE yandığını söyler, alevin biçimini vermez: düz bakışta
// ısı alanı lav gölü gibi okunuyor. Her piksel altındaki sıcak zemine bakar; ısı
// o yüksekliğe ulaşacak kadar güçlüyse orada alev dili vardır (ui/fireGL.js'teki
// gürültü-yükseklik yarışı). Taban province'e oturur, uçlar yukarı yalar.
const SHOW_FS = `#version 300 es
precision highp float;
precision highp sampler2D;
layout(std140) uniform Frame { mat4 uVP; vec4 uF0; vec4 uF1; };
in vec2 vP;
out vec4 o;
uniform sampler2D uHeat, uMask, uN;
uniform float uFade, uTongues;
const int STEPS = 7;
void main() {
  float time = uF1.x, wind = uF1.z;
  vec2 drift = texture(uN, vP * 2.1 + vec2(time * 0.03, time * 0.13)).rg - 0.5;
  float x = vP.x + drift.x * 0.018;
  float tongue = 0.0;
  float base = 0.0;
  for (int i = 0; i < STEPS && uTongues > 0.5; i++) {
    float k = float(i) / float(STEPS - 1);
    vec2 q = vec2(x + wind * k * k * 0.018, vP.y + k * ${RISE.toFixed(2)});
    float T = texture(uHeat, q).r;
    if (i == 0) base = T;
    if (T < 0.04) continue;
    // Gürültü ısıyla birlikte yükselir: diller kaynağından kopmadan kıvrılır.
    float warp = texture(uN, vec2(q.x * 3.4, vP.y * 1.9 + time * 0.52)).r;
    float lick = texture(uN, vec2(q.x * 8.5 + warp * 0.34, vP.y * 3.1 + time * 0.96)).g;
    float fine = texture(uN, vec2(q.x * 21.0 - warp * 0.5, vP.y * 7.0 + time * 1.7)).r;
    float turb = lick * 0.74 + fine * 0.36;
    float heat = (min(T, 1.5) * 0.6 * (0.34 + turb * 1.25) - k * 0.74 - 0.1) * 2.5;
    tongue = max(tongue, heat * (1.0 - k * 0.3));
  }
  base = texture(uHeat, vP).r;
  float f = clamp(tongue, 0.0, 1.0);
  vec3 fire = mix(vec3(0.3, 0.025, 0.0), vec3(0.95, 0.2, 0.012), smoothstep(0.06, 0.4, f));
  fire = mix(fire, vec3(1.0, 0.5, 0.07), smoothstep(0.34, 0.68, f));
  fire = mix(fire, vec3(1.0, 0.72, 0.24), smoothstep(0.7, 0.97, f));
  fire = mix(fire, vec3(1.0, 0.9, 0.62), smoothstep(0.985, 1.0, f));
  float flame = smoothstep(0.0, 0.62, f);
  // Zemin yalnız province içinde: kor, kurum ve yanmış toprak kıyıda kesilir.
  float m = smoothstep(0.34, 0.66, texture(uMask, vP).r);
  vec4 h = texture(uHeat, vP);
  float grain = texture(uN, vP * 6.3 + drift * 0.2).r;
  float coal = smoothstep(0.12, 0.6, base) * smoothstep(0.34, 0.66, grain) * m;
  float dark = max(smoothstep(0.08, 0.72, h.b * (0.62 + 0.76 * grain)) * 0.6, (1.0 - h.g) * 0.5 * smoothstep(0.3, 0.56, grain + 0.14)) * m;
  float warm = smoothstep(0.1, 0.9, base) * m;
  vec3 ground = vec3(0.028, 0.022, 0.018) * dark + vec3(0.62, 0.09, 0.008) * coal * 0.55
    + vec3(0.5, 0.13, 0.015) * warm * 0.42;
  float under = max(dark, max(coal * 0.55, warm * 0.2));
  vec3 c = ground * (1.0 - flame) + fire * flame;
  float a = max(under, flame * 0.86);
  o = vec4(c * uFade, a * uFade);
}`;

// Yangın alanına ekili gerçek alevler: boyu kökündeki sıcaklıktan gelir, yangın
// nereye yürürse alev orada büyür. Yan ve güney kıyıda kesilir, uçlar kuzeye yalar.
const REAL_VS = `#version 300 es
precision highp float;
precision highp sampler2D;
layout(location=0) in vec2 aC;
layout(location=1) in vec4 iR;
layout(std140) uniform Frame { mat4 uVP; vec4 uF0; vec4 uF1; };
uniform vec4 uRect;
uniform float uShift, uFade;
uniform sampler2D uHeat;
out vec2 vUv;
out vec2 vD;
flat out vec2 vS;
void main() {
  float grow = smoothstep(0.06, 0.5, textureLod(uHeat, iR.xy, 0.0).r) * uFade;
  vS = vec2(iR.z, grow);
  if (grow <= 0.02) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); vUv = vec2(0.0); vD = vec2(0.0); return; }
  float size = iR.w * mix(0.5, 1.0, grow);
  vec2 w = uRect.xy + iR.xy * uRect.zw
    + vec2(aC.x * 0.5 * size, -((aC.y * 0.5 + 0.5) * size - size * 0.3));
  gl_Position = uVP * vec4(w.x + uShift, w.y, 0.0, 1.0);
  vUv = vec2(aC.x * 0.5 + 0.5, 0.5 - aC.y * 0.5);
  vD = (w - uRect.xy) / uRect.zw;
}`;

const REAL_FS = `#version 300 es
precision highp float;
precision highp sampler2D;
layout(std140) uniform Frame { mat4 uVP; vec4 uF0; vec4 uF1; };
in vec2 vUv;
in vec2 vD;
flat in vec2 vS;
out vec4 o;
uniform sampler2D uMask;
${REAL_FIRE_GLSL}
void main() {
  float inside = max(texture(uMask, vD).r, max(texture(uMask, vD + vec2(0.0, 0.07)).r, texture(uMask, vD + vec2(0.0, 0.15)).r));
  float keep = smoothstep(0.36, 0.64, inside);
  if (keep <= 0.0) discard;
  vec4 f = realFire(vUv, vS.x, uF1.x);
  float k = keep * min(1.0, vS.y * 1.5);
  o = vec4(f.rgb * k, f.a * k * 0.72);
}`;

const PASS_UNIFORMS = ['uVel', 'uHeat', 'uField', 'uMask', 'uN', 'uT', 'uTime', 'uLevel', 'uRadius', 'uSeed', 'uCity'];

export class FireSim {
  /** Kayan nokta hedefi yoksa null: yangın gürültü aleviyle sürer. */
  static create(gl, quadVao, quad, noise) {
    if (!gl.getExtension('EXT_color_buffer_float')) return null;
    const sim = new FireSim(gl, quadVao, quad, noise);
    return sim.build() ? sim : null;
  }

  constructor(gl, quadVao, quad, noise) {
    this.gl = gl;
    this.vao = quadVao;
    this.quad = quad;
    this.atlas = null;
    this.turn = 0;
    this.noise = noise;
    this.slots = [];
    this.last = -1;
  }

  build() {
    const gl = this.gl;
    this.passes = {};
    for (const [name, body] of Object.entries(PASSES)) {
      const p = program(gl, PASS_VS, HEAD + body);
      if (!p) return false;
      this.passes[name] = { p, u: uniforms(gl, p, PASS_UNIFORMS) };
    }
    const show = program(gl, SHOW_VS, SHOW_FS);
    if (!show) return false;
    gl.uniformBlockBinding(show, gl.getUniformBlockIndex(show, 'Frame'), 0);
    this.show = { p: show, u: uniforms(gl, show, ['uRect', 'uShift', 'uHeat', 'uMask', 'uN', 'uFade', 'uTongues']) };
    const real = program(gl, REAL_VS, REAL_FS);
    if (!real) return false;
    gl.uniformBlockBinding(real, gl.getUniformBlockIndex(real, 'Frame'), 0);
    this.real = { p: real, u: uniforms(gl, real, ['uRect', 'uShift', 'uFade', 'uHeat', 'uMask', 'uAtlas']) };
    this.pressure = [this.target(), this.target()];
    this.scratch = this.target();
    for (let i = 0; i < SIM_SLOTS; i++) {
      this.slots.push({
        active: false, vel: [this.target(), this.target()], heat: [this.target(), this.target()],
        mask: gl.createTexture(), rect: [0, 0, 1, 1], city: [0.5, 0.5], level: 0, radius: 0, seed: 0.05, fade: 0,
        ...this.rootBuffers(), roots: 0,
      });
    }
    return true;
  }

  rootBuffers() {
    const gl = this.gl;
    const rootVao = gl.createVertexArray();
    const rootVbo = gl.createBuffer();
    gl.bindVertexArray(rootVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, rootVbo);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 16, 0);
    gl.vertexAttribDivisor(1, 1);
    gl.bindVertexArray(null);
    return { rootVao, rootVbo };
  }

  target() {
    const gl = this.gl;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA16F, RES, RES);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { tex, fbo };
  }

  clearTarget(target, r, g, b, a) {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
    gl.clearColor(r, g, b, a);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  /** Yuvayı yeni bir yangına verir. mask: province şekli (RES×RES tuval). */
  open(index, rect, city, maskCanvas, seed, roots) {
    const gl = this.gl;
    const slot = this.slots[index];
    gl.bindBuffer(gl.ARRAY_BUFFER, slot.rootVbo);
    gl.bufferData(gl.ARRAY_BUFFER, roots, gl.STATIC_DRAW);
    slot.roots = roots.length / 4;
    for (const target of slot.vel) this.clearTarget(target, 0, 0, 0, 1);
    for (const target of slot.heat) this.clearTarget(target, 0, 1, 0, 1);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.clearColor(0, 0, 0, 0);
    gl.bindTexture(gl.TEXTURE_2D, slot.mask);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, gl.RED, gl.UNSIGNED_BYTE, maskCanvas);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    slot.rect = rect;
    slot.city = city;
    slot.seed = seed;
    slot.fade = 0;
    slot.active = true;
  }

  close(index) {
    this.slots[index].active = false;
  }

  bind(unit, tex) {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, tex);
  }

  pass(name, target, slot, time, field = null, heatOverride = null) {
    const gl = this.gl;
    const { p, u } = this.passes[name];
    gl.useProgram(p);
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
    this.bind(0, slot.vel[0].tex);
    this.bind(1, heatOverride ?? slot.heat[0].tex);
    this.bind(2, field ?? this.scratch.tex);
    this.bind(3, slot.mask);
    this.bind(4, this.noise());
    gl.uniform1i(u.uVel, 0);
    gl.uniform1i(u.uHeat, 1);
    gl.uniform1i(u.uField, 2);
    gl.uniform1i(u.uMask, 3);
    gl.uniform1i(u.uN, 4);
    gl.uniform2f(u.uT, 1 / RES, 1 / RES);
    gl.uniform1f(u.uTime, time);
    gl.uniform1f(u.uLevel, slot.level);
    gl.uniform1f(u.uRadius, slot.radius);
    gl.uniform1f(u.uSeed, slot.seed);
    gl.uniform2f(u.uCity, slot.city[0], slot.city[1]);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  stepSlot(slot, time) {
    this.pass('advectVel', slot.vel[1], slot, time);
    slot.vel.reverse();
    this.pass('advectHeat', slot.heat[1], slot, time);
    slot.heat.reverse();
    this.pass('curl', this.scratch, slot, time);
    this.pass('force', slot.vel[1], slot, time);
    slot.vel.reverse();
    this.pass('divergence', this.scratch, slot, time);
    this.clearTarget(this.pressure[0], 0, 0, 0, 1);
    this.gl.clearColor(0, 0, 0, 0);
    for (let i = 0; i < JACOBI; i++) {
      this.pass('jacobi', this.pressure[1], slot, time, this.scratch.tex, this.pressure[0].tex);
      this.pressure.reverse();
    }
    this.pass('gradient', slot.vel[1], slot, time, null, this.pressure[0].tex);
    slot.vel.reverse();
  }

  /** Kare hızından bağımsız en çok bir adım: yavaş karede yangın ağırlaşır, patlamaz. */
  step(time) {
    if (time - this.last < STEP_SECONDS * 0.9) return;
    this.last = time;
    if (!this.slots.some((slot) => slot.active)) return;
    const gl = this.gl;
    gl.disable(gl.BLEND);
    gl.viewport(0, 0, RES, RES);
    gl.bindVertexArray(this.vao);
    // İki yangın aynı karede çözülmez: GPU işi karelere eşit yayılır.
    this.turn = (this.turn + 1) % SIM_SLOTS;
    const pick = this.slots[this.turn].active ? this.slots[this.turn] : this.slots.find((slot) => slot.active);
    for (const slot of this.slots) if (slot.active) slot.fade = Math.min(1, slot.fade + STEP_SECONDS / 1.2);
    this.stepSlot(pick, time);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.activeTexture(gl.TEXTURE0);
    gl.enable(gl.BLEND);
  }

  draw(shift) {
    const gl = this.gl;
    const live = this.slots.filter((slot) => slot.active);
    if (!live.length) return;
    const { p, u } = this.show;
    gl.useProgram(p);
    gl.uniform1i(u.uHeat, 1);
    gl.uniform1i(u.uMask, 2);
    gl.uniform1i(u.uN, 0);
    gl.uniform1f(u.uShift, shift);
    gl.uniform1f(u.uTongues, this.atlas ? 0 : 1);
    gl.bindVertexArray(this.vao);
    for (const slot of live) {
      this.bind(1, slot.heat[0].tex);
      this.bind(2, slot.mask);
      gl.activeTexture(gl.TEXTURE0);
      gl.uniform4f(u.uRect, slot.rect[0], slot.rect[1], slot.rect[2], slot.rect[3]);
      gl.uniform1f(u.uFade, slot.fade);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    if (!this.atlas) return;
    const real = this.real;
    gl.useProgram(real.p);
    gl.uniform1i(real.u.uHeat, 1);
    gl.uniform1i(real.u.uMask, 2);
    gl.uniform1i(real.u.uAtlas, 3);
    gl.uniform1f(real.u.uShift, shift);
    this.bind(3, this.atlas);
    for (const slot of live) {
      this.bind(1, slot.heat[0].tex);
      this.bind(2, slot.mask);
      gl.activeTexture(gl.TEXTURE0);
      gl.uniform4f(real.u.uRect, slot.rect[0], slot.rect[1], slot.rect[2], slot.rect[3]);
      gl.uniform1f(real.u.uFade, slot.fade);
      gl.bindVertexArray(slot.rootVao);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, slot.roots);
    }
    gl.bindVertexArray(this.vao);
  }
}

export const FIRE_SIM_RES = RES;
