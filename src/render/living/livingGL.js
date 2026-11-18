// YAŞAYAN DÜNYA TUVALİ — denizin üstünde, mürekkebin altında duran WebGL2 katmanı.
//
// Sıra: #map-water (kara + taban deniz) → #map-kirilma (three.js denizi) →
// #map-living (bu tuval) → #map (sınır, yazı, birim). Deniz buzu ve bulut
// gölgesi bu yüzden denizin üstüne biner ve deniz pikselleri hiç değişmez;
// şehir maketleri sınırın ve yazının altında kalır, okunurluğu bozmaz.
//
// Geçişler: alan (buz, bulut gölgesi, kapalı hava, gece; yarım çözünürlük) →
// demiryolu → yağış → maketler → duman ve ışık. Hepsi önçarpımlı alfa.
//
// Katman notu: DOM ve GPU'ya dokunur, oyun durumuna dokunmaz.

import { GpuTimer } from '../gpuTimer.js';
import { fbm, makeRng } from '../textures.js';

export const FRONT_COUNT = 7;

const FULLSCREEN = `#version 300 es
void main() {
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

/** Cephenin yoğunluğu: alan ve yağış geçişi aynı şekli görsün. */
const FRONT_GLSL = `
float frontAt(vec2 w, vec4 a, vec4 b) {
  float dx = w.x - a.x;
  dx -= uSpan.x * floor(dx / uSpan.x + 0.5);
  vec2 d = vec2(dx, w.y - a.y);
  float u = d.x * a.z + d.y * a.w;
  float v = -d.x * a.w + d.y * a.z;
  v += sin(u / b.x * 2.6 + a.x * 0.013) * b.y * 0.75;
  float along = 1.0 - smoothstep(0.5, 1.0, abs(u) / b.x);
  return along * exp(-(v * v) / (b.y * b.y)) * b.z;
}`;

const FIELD_FRAG = `#version 300 es
precision highp float;
out vec4 fragColor;
uniform vec2 uViewport;
uniform vec2 uRes;
uniform vec2 uCam;
uniform float uZoom;
uniform float uPersp;
uniform vec3 uEye;
uniform vec3 uRight;
uniform vec3 uUp;
uniform vec3 uFwd;
uniform float uFocal;
uniform vec2 uOrigin;
uniform vec2 uSpan;
uniform float uTime;
uniform float uS;
uniform float uCool;
uniform float uDistMax;
uniform float uHex;
uniform float uEq;
uniform vec4 uOn;           // x buz, y bulut, z cephe, w gece
uniform vec2 uSun;          // boylam, dik açı
uniform vec4 uFrontA[${FRONT_COUNT}];
uniform vec4 uFrontB[${FRONT_COUNT}];
uniform sampler2D uClimate;
uniform sampler2D uDist;
uniform sampler2D uNoise;
${FRONT_GLSL}

void over(inout vec4 acc, vec3 c, float a) {
  acc = vec4(c * a + acc.rgb * (1.0 - a), a + acc.a * (1.0 - a));
}

void main() {
  vec2 scr = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y) * uViewport / uRes;
  vec2 world;
  if (uPersp > 0.5) {
    // Eğik kamera: ışın deniz düzlemine iner. Bulut ve gece yumuşak olduğu
    // için dağın yüksekliği ihmal edilir; buz zaten deniz seviyesindedir.
    vec2 ab = vec2(scr.x - uViewport.x * 0.5, uViewport.y * 0.5 - scr.y) / uFocal;
    vec3 d = uFwd + uRight * ab.x + uUp * ab.y;
    if (d.z > -1e-4) { fragColor = vec4(0.0); return; }
    world = uEye.xy + d.xy * (-uEye.z / d.z);
  } else {
    world = (scr - uViewport * 0.5) / uZoom + uCam;
  }
  vec2 uv = (world - uOrigin) / uSpan;
  if (uv.y < 0.0 || uv.y > 1.0) { fragColor = vec4(0.0); return; }
  vec2 q = world / uSpan.x;
  // Değer gürültüsü kafese hizalıdır ve düz okununca bloklu görünür. Tam sayılı
  // döndürme kafesi kırar, sarmal dikişinde yine tam sayı kayar: dikiş çıkmaz.
  vec2 r = mat2(3.0, -4.0, 4.0, 3.0) * q;
  vec4 acc = vec4(0.0);

  if (uOn.x > 0.5) {
    float dist = texture(uDist, uv).r * uDistMax;
    float sea = smoothstep(uHex * 0.14, uHex * 0.36, dist);
    if (sea > 0.0) {
      vec4 c = texture(uClimate, uv);
      // Deniz karadan geç ısınır, geç soğur: okyanus ılık, salınımı dar. Buz
      // yalnız kutup denizinde kalıcı, orta enlemlere kışın iner.
      // Deniz buzu en geniş hâline kış bittikten sonra ulaşır.
      float seaT = c.b * 90.0 - 31.0 + (c.a - 0.5) * 56.0 * (uS + uCool * 0.45);
      float n1 = texture(uNoise, r * 2.0).r;
      float n2 = texture(uNoise, r * 7.0 + 0.3).g;
      float n3 = texture(uNoise, r * 23.0 + 0.6).b;
      // Buz kıyıdan büyür: sığ su önce donar.
      float shore = 1.0 - smoothstep(0.0, uHex * 5.0, dist);
      float margin = -1.8 - seaT + (n1 - 0.5) * 8.0 + shore * 2.2;
      float ice = smoothstep(0.0, 1.6, margin);
      float floe = smoothstep(0.34, 0.50, ice + (n2 - 0.5) * 0.75 + (n3 - 0.5) * 0.4);
      if (floe > 0.0) {
        // Buz tek parça açık bir örtüdür: ton farkı dar, çatlak ince.
        vec3 tone = mix(vec3(0.75, 0.83, 0.88), vec3(0.86, 0.91, 0.94), smoothstep(0.25, 0.75, n2));
        float crack = 1.0 - smoothstep(0.0, 0.016, abs(n3 - 0.5));
        tone *= 1.0 - crack * 0.10 * smoothstep(0.5, 1.0, ice);
        over(acc, tone, floe * sea * 0.95);
      }
    }
  }

  float front = 0.0;
  if (uOn.z > 0.5) {
    for (int i = 0; i < ${FRONT_COUNT}; i++) front = max(front, frontAt(world, uFrontA[i], uFrontB[i]));
  }
  if (uOn.y > 0.5 || front > 0.0) {
    // Ölçekler tam sayı: kesirli çarpan sarmal dikişinde bulutu ikiye bölerdi.
    vec2 wind = vec2(uTime * 0.0034, uTime * 0.0011);
    vec2 warp = texture(uNoise, q * 3.0 + wind * 0.2).rg - 0.5;
    float d = texture(uNoise, r + wind + warp * 0.13).r * 0.62
      + texture(uNoise, r * 3.0 + wind * 2.0 - warp * 0.21 + vec2(uTime * 0.0016, 0.0)).g * 0.38;
    float cover = smoothstep(0.56, 0.72, d) * uOn.y;
    // Yalnız gölge çizilir; bulutun kendisi haritanın önüne geçmez.
    over(acc, vec3(0.055, 0.085, 0.125), cover * 0.13);
    if (front > 0.0) {
      float broken = smoothstep(0.10, 0.90, front * (0.62 + d * 0.9));
      over(acc, vec3(0.34, 0.38, 0.44), broken * 0.20);
    }
  }

  if (uOn.w > 0.5) {
    float lat = (uEq - uv.y) * 2.98;
    float lon = uv.x * 6.2831853;
    float h = sin(lat) * sin(uSun.y) + cos(lat) * cos(uSun.y) * cos(lon - uSun.x);
    float night = 1.0 - smoothstep(-0.12, 0.10, h);
    // Alacakaranlık ince ve sıcak; gece yalnız hafif bir örtü, harita okunur kalır.
    over(acc, vec3(0.85, 0.46, 0.20), exp(-(h * h) / 0.0036) * 0.07);
    over(acc, vec3(0.030, 0.052, 0.115), night * 0.23);
  }
  fragColor = acc;
}`;

const BLIT_FRAG = `#version 300 es
precision highp float;
out vec4 fragColor;
uniform sampler2D uTex;
uniform sampler2D uNoise;
uniform vec2 uRes;
void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  vec4 c = texture(uTex, uv);
  // Kısık alfalı geniş geçiş 8 bitte bantlaşır: bir tık titreşim yeter.
  float n = texture(uNoise, gl_FragCoord.xy / 256.0).b - 0.5;
  fragColor = vec4(c.rgb + n * c.a * 0.012, c.a);
}`;

const SPRITE_VERT = `#version 300 es
layout(location = 0) in vec2 aCenter;
layout(location = 1) in float aSize;
layout(location = 2) in vec3 aCell;
layout(location = 3) in vec3 aLook;
uniform vec2 uViewport;
out vec2 vUv;
out vec3 vLook;
void main() {
  vec2 c = vec2(float(gl_VertexID & 1), float((gl_VertexID >> 1) & 1));
  vec2 p = aCenter + (c - 0.5) * aSize;
  vUv = aCell.xy + c * aCell.z;
  vLook = aLook;
  gl_Position = vec4(p.x / uViewport.x * 2.0 - 1.0, 1.0 - p.y / uViewport.y * 2.0, 0.0, 1.0);
}`;

const SPRITE_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
in vec3 vLook;   // x kar, y gece, z alfa
out vec4 fragColor;
uniform sampler2D uColor;
uniform sampler2D uMask;
void main() {
  vec4 c = texture(uColor, vUv);
  if (c.a < 0.004) discard;
  vec4 m = texture(uMask, vUv);
  vec3 rgb = c.rgb;
  float solid = smoothstep(0.55, 0.95, c.a);
  // Çatıya kar: yalnız yukarı bakan yüzey beyazlar, duvar ve gölge kalır.
  rgb = mix(rgb, vec3(0.84, 0.88, 0.93) * c.a, vLook.x * m.g * solid);
  // Gece maket karanlığa çekilir, pencereler yanar.
  rgb *= mix(vec3(1.0), vec3(0.34, 0.40, 0.56), vLook.y);
  rgb += vec3(1.0, 0.70, 0.34) * m.r * vLook.y * solid * 1.5;
  fragColor = vec4(rgb, c.a) * vLook.z;
}`;

const PUFF_VERT = `#version 300 es
layout(location = 0) in vec2 aCenter;
layout(location = 1) in vec2 aSize;
layout(location = 2) in vec4 aColor;
uniform vec2 uViewport;
out vec2 vP;
out vec4 vColor;
void main() {
  vec2 c = vec2(float(gl_VertexID & 1), float((gl_VertexID >> 1) & 1)) * 2.0 - 1.0;
  vP = c;
  vColor = aColor;
  vec2 p = aCenter + c * aSize;
  gl_Position = vec4(p.x / uViewport.x * 2.0 - 1.0, 1.0 - p.y / uViewport.y * 2.0, 0.0, 1.0);
}`;

const PUFF_FRAG = `#version 300 es
precision highp float;
in vec2 vP;
in vec4 vColor;
out vec4 fragColor;
void main() {
  float d = dot(vP, vP);
  if (d > 1.0) discard;
  float a = (1.0 - d);
  fragColor = vColor * a * a;
}`;

const RAIL_VERT = `#version 300 es
layout(location = 0) in vec2 aPos;
layout(location = 1) in vec2 aNormal;
layout(location = 2) in vec2 aRun;   // yan (−1..1), yay boyu
layout(location = 3) in float aH;
uniform mat4 uViewProj;
uniform float uShift;
uniform float uHalf;
uniform float uHeightScale;
uniform float uHeightCurve;
out vec2 vRun;
void main() {
  vec2 w = aPos + aNormal * aRun.x * uHalf + vec2(uShift, 0.0);
  float h = max(aH, 0.0);
  float z = h * (1.0 - uHeightCurve + uHeightCurve * h) * uHeightScale;
  vRun = aRun;
  gl_Position = uViewProj * vec4(w, z, 1.0);
}`;

const RAIL_FRAG = `#version 300 es
precision highp float;
in vec2 vRun;
out vec4 fragColor;
uniform float uAlpha;
void main() {
  float side = abs(vRun.x);
  // Traversler yatak boyunca, iki ray üstünde.
  float tie = step(fract(vRun.y / 2.3), 0.42) * (1.0 - smoothstep(0.82, 1.0, side));
  float rail = 1.0 - smoothstep(0.08, 0.2, abs(side - 0.52));
  vec3 c = mix(vec3(0.20, 0.16, 0.12), vec3(0.09, 0.09, 0.10), rail);
  float a = max(tie * 0.62, rail * 0.95);
  fragColor = vec4(c, 1.0) * a * uAlpha;
}`;

const PRECIP_VERT = `#version 300 es
layout(location = 0) in vec4 aA;
layout(location = 1) in vec4 aB;
uniform mat4 uViewProj;
uniform float uShift;
out vec2 vWorld;
flat out vec4 vA;
flat out vec4 vB;
void main() {
  vec2 c = vec2(float(gl_VertexID & 1), float((gl_VertexID >> 1) & 1)) * 2.0 - 1.0;
  vec2 l = c * vec2(aB.x, aB.y * 2.8);
  vec2 w = aA.xy + vec2(l.x * aA.z - l.y * aA.w, l.x * aA.w + l.y * aA.z) + vec2(uShift, 0.0);
  vWorld = w;
  vA = aA;
  vB = aB;
  gl_Position = uViewProj * vec4(w, 0.0, 1.0);
}`;

const PRECIP_FRAG = `#version 300 es
precision highp float;
in vec2 vWorld;
flat in vec4 vA;
flat in vec4 vB;
out vec4 fragColor;
uniform vec2 uSpan;
uniform vec2 uOrigin;
uniform float uTime;
uniform float uS;
uniform float uDpr;
uniform float uAlpha;
uniform float uFlake;
uniform sampler2D uClimate;
uniform sampler2D uNoise;
${FRONT_GLSL}
void main() {
  float m = frontAt(vWorld, vA, vB);
  if (m < 0.04) discard;
  vec2 uv = (vWorld - uOrigin) / uSpan;
  vec4 c = texture(uClimate, uv);
  float tC = c.b * 90.0 - 40.0 + (c.a - 0.5) * 80.0 * uS;
  vec2 s = gl_FragCoord.xy / uDpr;
  float snowy = 1.0 - smoothstep(-1.0, 1.5, tC);
  // Yağmur: gürültü boyuna gerilir, çizgi olur; hafif rüzgâr eğimi.
  float rain = texture(uNoise, vec2((s.x + s.y * 0.2) * 0.030, s.y * 0.0034 + uTime * 0.92)).b;
  float streak = smoothstep(0.68, 0.76, rain);
  // Kar: iki katman, yavaş düşen ve salınan iri tane.
  vec2 f1 = s * 0.021 + vec2(sin(uTime * 0.6) * 0.05, uTime * 0.16);
  vec2 f2 = s * 0.034 + vec2(cos(uTime * 0.45) * 0.07, uTime * 0.24);
  float flake = max(smoothstep(0.82, 0.87, texture(uNoise, f1).b), smoothstep(0.84, 0.89, texture(uNoise, f2).b));
  vec3 col = mix(vec3(0.70, 0.78, 0.86), vec3(0.95, 0.97, 1.0), snowy);
  float a = mix(streak * 0.22 * uAlpha, flake * 0.55 * uFlake, snowy) * smoothstep(0.08, 0.5, m);
  fragColor = vec4(col * a, a);
}`;

function compile(gl, type, src, tag) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    throw new Error(`[living] ${tag}: ${gl.getShaderInfoLog(sh)}`);
  }
  return sh;
}

function program(gl, vert, frag, names, tag) {
  const prog = gl.createProgram();
  gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, vert, `${tag}.vert`));
  gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, frag, `${tag}.frag`));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    throw new Error(`[living] ${tag}: ${gl.getProgramInfoLog(prog)}`);
  }
  const u = {};
  for (const n of names) u[n] = gl.getUniformLocation(prog, n);
  return { prog, u };
}

export class LivingGL {
  /** Tuvali #map'in hemen önüne kurar; WebGL2 yoksa null (katman hiç çizilmez). */
  static create(map) {
    const canvas = document.createElement('canvas');
    canvas.id = 'map-living';
    canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;display:block;'
      + 'z-index:0;pointer-events:none;';
    const gl = canvas.getContext('webgl2', {
      alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false,
      powerPreference: 'high-performance',
    });
    if (!gl) return null;
    map.before(canvas);
    // Yönetim ekranı açıkken harita geri çekilir (styles.css: body.screen-open #map).
    const st = document.createElement('style');
    st.textContent = '#map-living{transition:filter 180ms ease}'
      + 'body.screen-open #map-living{filter:saturate(0.72) brightness(0.82)}';
    document.head.appendChild(st);
    try {
      return new LivingGL(canvas, gl);
    } catch (err) {
      console.error(err.message);
      canvas.remove();
      return null;
    }
  }

  constructor(canvas, gl) {
    this.canvas = canvas;
    this.gl = gl;
    this.lost = false;
    this.images = null;
    this.climateData = null;
    this.initGL();
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.lost = true;
    });
    canvas.addEventListener('webglcontextrestored', () => {
      this.initGL();
      this.lost = false;
      this.onRestored?.();
      if (this.images) this.setAtlas(this.images.color, this.images.mask);
      const c = this.climateData;
      this.climateData = null;
      if (c) this.setClimate(c);
    });
  }

  initGL() {
    const gl = this.gl;
    this.timer = GpuTimer.create(gl);
    this.field = program(gl, FULLSCREEN, FIELD_FRAG, ['uViewport', 'uRes', 'uCam', 'uZoom', 'uPersp', 'uEye',
      'uRight', 'uUp', 'uFwd', 'uFocal', 'uOrigin', 'uSpan', 'uTime', 'uS', 'uCool', 'uDistMax', 'uHex', 'uEq', 'uOn',
      'uSun', 'uFrontA', 'uFrontB', 'uClimate', 'uDist', 'uNoise'], 'field');
    this.blit = program(gl, FULLSCREEN, BLIT_FRAG, ['uTex', 'uNoise', 'uRes'], 'blit');
    this.sprite = program(gl, SPRITE_VERT, SPRITE_FRAG, ['uViewport', 'uColor', 'uMask'], 'sprite');
    this.puff = program(gl, PUFF_VERT, PUFF_FRAG, ['uViewport'], 'puff');
    this.rail = program(gl, RAIL_VERT, RAIL_FRAG, ['uViewProj', 'uShift', 'uHalf', 'uHeightScale', 'uHeightCurve', 'uAlpha'], 'rail');
    this.precip = program(gl, PRECIP_VERT, PRECIP_FRAG, ['uViewProj', 'uShift', 'uSpan', 'uOrigin', 'uTime', 'uS',
      'uDpr', 'uAlpha', 'uFlake', 'uClimate', 'uNoise'], 'precip');
    this.emptyVao = gl.createVertexArray();

    // Gürültü: dört bağımsız döşenebilir alan. Oyunun zarından değil yerel tohumdan.
    const size = 256;
    const a = fbm(size, size, [3, 6, 12, 24], makeRng(5301));
    const b = fbm(size, size, [8, 16, 32], makeRng(5302));
    const c = fbm(size, size, [24, 48, 96], makeRng(5303));
    const stretch = (f) => {
      let lo = Infinity;
      let hi = -Infinity;
      for (const v of f) {
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
      return (v) => Math.round(((v - lo) / Math.max(1e-6, hi - lo)) * 255);
    };
    const [sa, sb, sc] = [stretch(a), stretch(b), stretch(c)];
    const data = new Uint8Array(size * size * 4);
    for (let i = 0; i < size * size; i++) {
      data[i * 4] = sa(a[i]);
      data[i * 4 + 1] = sb(b[i]);
      data[i * 4 + 2] = sc(c[i]);
      data[i * 4 + 3] = 255;
    }
    this.noiseTex = this.tex(gl.RGBA8, gl.RGBA, size, size, data, gl.LINEAR, gl.REPEAT, gl.REPEAT);
    this.climateTex = null;
    this.distTex = null;
    this.atlasColor = null;
    this.atlasMask = null;

    // Örnek tamponları: kare başına yeniden doldurulur, yeniden ayrılmaz.
    this.spriteVao = gl.createVertexArray();
    this.spriteBuf = gl.createBuffer();
    gl.bindVertexArray(this.spriteVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.spriteBuf);
    const S = 9 * 4;
    for (const [loc, n, off] of [[0, 2, 0], [1, 1, 8], [2, 3, 12], [3, 3, 24]]) {
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, n, gl.FLOAT, false, S, off);
      gl.vertexAttribDivisor(loc, 1);
    }
    this.puffVao = gl.createVertexArray();
    this.puffBuf = gl.createBuffer();
    gl.bindVertexArray(this.puffVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.puffBuf);
    const Q = 8 * 4;
    for (const [loc, n, off] of [[0, 2, 0], [1, 2, 8], [2, 4, 16]]) {
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, n, gl.FLOAT, false, Q, off);
      gl.vertexAttribDivisor(loc, 1);
    }
    this.precipVao = gl.createVertexArray();
    this.precipBuf = gl.createBuffer();
    gl.bindVertexArray(this.precipVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.precipBuf);
    for (const [loc, off] of [[0, 0], [1, 16]]) {
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 4, gl.FLOAT, false, 32, off);
      gl.vertexAttribDivisor(loc, 1);
    }
    this.railVao = gl.createVertexArray();
    this.railBuf = gl.createBuffer();
    this.railCount = 0;
    gl.bindVertexArray(this.railVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.railBuf);
    const R = 7 * 4;
    for (const [loc, n, off] of [[0, 2, 0], [1, 2, 8], [2, 2, 16], [3, 1, 24]]) {
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, n, gl.FLOAT, false, R, off);
    }
    gl.bindVertexArray(null);
    this.fbo = null;
  }

  tex(internal, format, w, h, data, filter, wrapS, wrapT) {
    const gl = this.gl;
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, format, gl.UNSIGNED_BYTE, data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrapS);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrapT);
    return t;
  }

  /** Dünya başına: iklim ve kıyı uzaklığı (SurfaceGL.climate). */
  setClimate(climate) {
    if (this.climateData === climate || this.lost) return;
    const gl = this.gl;
    if (this.climateTex) gl.deleteTexture(this.climateTex);
    if (this.distTex) gl.deleteTexture(this.distTex);
    this.climateTex = this.tex(gl.RGBA8, gl.RGBA, climate.w, climate.h, climate.data, gl.LINEAR, gl.REPEAT, gl.CLAMP_TO_EDGE);
    this.distTex = this.tex(gl.R8, gl.RED, climate.w, climate.h, climate.dist, gl.LINEAR, gl.REPEAT, gl.CLAMP_TO_EDGE);
    this.climateData = climate;
  }

  setAtlas(color, mask) {
    this.images = { color, mask };
    if (this.lost) return;
    const gl = this.gl;
    const load = (img, premultiply) => {
      const t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, premultiply);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, img);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      const aniso = gl.getExtension('EXT_texture_filter_anisotropic');
      if (aniso) gl.texParameterf(gl.TEXTURE_2D, aniso.TEXTURE_MAX_ANISOTROPY_EXT, 4);
      return t;
    };
    this.atlasColor = load(color, true);
    this.atlasMask = load(mask, false);
  }

  /** Demiryolu şeridi: her düğüme iki köşe, üçgen şerit parçaları dizini yerine çift üçgen. */
  setRails(vertices) {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.railBuf);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
    this.railCount = vertices.length / 7;
  }

  resize(cssW, cssH, dpr) {
    const gl = this.gl;
    const w = Math.max(1, Math.round(cssW * dpr));
    const h = Math.max(1, Math.round(cssH * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    const fw = Math.max(1, w >> 1);
    const fh = Math.max(1, h >> 1);
    if (this.fbo?.w === fw && this.fbo?.h === fh) return;
    if (this.fbo) {
      gl.deleteFramebuffer(this.fbo.fb);
      gl.deleteTexture(this.fbo.tex);
    }
    const tex = this.tex(gl.RGBA8, gl.RGBA, fw, fh, null, gl.LINEAR, gl.CLAMP_TO_EDGE, gl.CLAMP_TO_EDGE);
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.fbo = { fb, tex, w: fw, h: fh };
  }

  begin() {
    const gl = this.gl;
    this.timer?.poll();
    this.timer?.begin();
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  }

  /** Alan geçişi: yarım çözünürlükte hesaplanır, tuvale süzülerek büyütülür. */
  drawField(f) {
    const gl = this.gl;
    if (!this.climateTex || !this.fbo) return;
    const F = this.fbo;
    const P = this.field;
    const u = P.u;
    gl.bindFramebuffer(gl.FRAMEBUFFER, F.fb);
    gl.viewport(0, 0, F.w, F.h);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.disable(gl.BLEND);
    gl.useProgram(P.prog);
    gl.bindVertexArray(this.emptyVao);
    gl.uniform2f(u.uViewport, f.viewW, f.viewH);
    gl.uniform2f(u.uRes, F.w, F.h);
    gl.uniform2f(u.uCam, f.camX, f.camY);
    gl.uniform1f(u.uZoom, f.zoom);
    const v = f.view;
    gl.uniform1f(u.uPersp, v ? 1 : 0);
    if (v) {
      gl.uniform3fv(u.uEye, v.eye);
      gl.uniform3fv(u.uRight, v.right);
      gl.uniform3fv(u.uUp, v.up);
      gl.uniform3fv(u.uFwd, v.fwd);
      gl.uniform1f(u.uFocal, v.f);
    }
    gl.uniform2f(u.uOrigin, f.originX, f.originY);
    gl.uniform2f(u.uSpan, f.spanX, f.spanY);
    gl.uniform1f(u.uTime, f.time);
    gl.uniform1f(u.uS, f.S);
    gl.uniform1f(u.uCool, f.cool);
    gl.uniform1f(u.uDistMax, f.distMax);
    gl.uniform1f(u.uHex, f.hex);
    gl.uniform1f(u.uEq, f.equator);
    gl.uniform4f(u.uOn, f.ice ? 1 : 0, f.clouds ? 1 : 0, f.fronts ? 1 : 0, f.night ? 1 : 0);
    gl.uniform2f(u.uSun, f.sunLon, f.sunDecl);
    gl.uniform4fv(u.uFrontA, f.frontA);
    gl.uniform4fv(u.uFrontB, f.frontB);
    this.bindTex(0, this.climateTex, u.uClimate);
    this.bindTex(1, this.distTex, u.uDist);
    this.bindTex(2, this.noiseTex, u.uNoise);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.enable(gl.BLEND);
    const B = this.blit;
    gl.useProgram(B.prog);
    gl.uniform2f(B.u.uRes, this.canvas.width, this.canvas.height);
    this.bindTex(0, F.tex, B.u.uTex);
    this.bindTex(1, this.noiseTex, B.u.uNoise);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  bindTex(unit, tex, loc) {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.uniform1i(loc, unit);
  }

  drawRails(viewProj, shifts, halfWidth, alpha, heightScale, heightCurve) {
    if (!this.railCount) return;
    const gl = this.gl;
    const P = this.rail;
    gl.useProgram(P.prog);
    gl.bindVertexArray(this.railVao);
    gl.uniformMatrix4fv(P.u.uViewProj, false, viewProj);
    gl.uniform1f(P.u.uHalf, halfWidth);
    gl.uniform1f(P.u.uAlpha, alpha);
    gl.uniform1f(P.u.uHeightScale, heightScale);
    gl.uniform1f(P.u.uHeightCurve, heightCurve);
    for (const s of shifts) {
      gl.uniform1f(P.u.uShift, s);
      gl.drawArrays(gl.TRIANGLES, 0, this.railCount);
    }
  }

  drawPrecip(f, viewProj, shifts, data, count) {
    if (!count || !this.climateTex) return;
    const gl = this.gl;
    const P = this.precip;
    const u = P.u;
    gl.useProgram(P.prog);
    gl.bindVertexArray(this.precipVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.precipBuf);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
    gl.uniformMatrix4fv(u.uViewProj, false, viewProj);
    gl.uniform2f(u.uSpan, f.spanX, f.spanY);
    gl.uniform2f(u.uOrigin, f.originX, f.originY);
    gl.uniform1f(u.uTime, f.time);
    gl.uniform1f(u.uS, f.S);
    gl.uniform1f(u.uDpr, f.dpr);
    gl.uniform1f(u.uAlpha, f.precipAlpha);
    gl.uniform1f(u.uFlake, f.flakeAlpha);
    this.bindTex(0, this.climateTex, u.uClimate);
    this.bindTex(1, this.noiseTex, u.uNoise);
    for (const s of shifts) {
      gl.uniform1f(u.uShift, s);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, count);
    }
  }

  drawSprites(viewW, viewH, data, count) {
    if (!count || !this.atlasColor) return;
    const gl = this.gl;
    const P = this.sprite;
    gl.useProgram(P.prog);
    gl.bindVertexArray(this.spriteVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.spriteBuf);
    gl.bufferData(gl.ARRAY_BUFFER, data.subarray(0, count * 9), gl.DYNAMIC_DRAW);
    gl.uniform2f(P.u.uViewport, viewW, viewH);
    this.bindTex(0, this.atlasColor, P.u.uColor);
    this.bindTex(1, this.atlasMask, P.u.uMask);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, count);
  }

  drawPuffs(viewW, viewH, data, count) {
    if (!count) return;
    const gl = this.gl;
    const P = this.puff;
    gl.useProgram(P.prog);
    gl.bindVertexArray(this.puffVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.puffBuf);
    gl.bufferData(gl.ARRAY_BUFFER, data.subarray(0, count * 8), gl.DYNAMIC_DRAW);
    gl.uniform2f(P.u.uViewport, viewW, viewH);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, count);
  }

  finish() {
    this.gl.bindVertexArray(null);
    this.timer?.end();
  }

  /** Bu tuvalin son karelerdeki GPU süresi (ms, kayan ortalama); ölçüm yoksa null. */
  gpuMs() {
    return this.timer?.ema ?? null;
  }

  clear() {
    if (this.lost) return;
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }
}
