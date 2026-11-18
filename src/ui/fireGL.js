// Gerçekçi alev: parçacık değil, GPU'da akan gürültü alanı.
//
// Parçacıkla çizilen alev "turuncu noktalar" olarak okunuyordu. Burada alev
// sıcaklık alanıdır: bükülmüş fBm yukarı akar, sütun biçimiyle kesilir, renk
// siyah cisim ışımasından (koyu kızıl → turuncu → sarı → beyaz çekirdek) gelir.
// Video dosyası yok: depo büyümez, alev hiç tekrar etmez.
//
// Tek küçük WebGL tuvali birkaç alev karesini ızgara hâlinde çizer; menü ve
// gösterge kartları kareleri kendi 2B tuvallerine `lighter` ile basar. WebGL
// yoksa fireFrame null döner ve çağıran alevsiz devam eder.
//
// Katman notu: DOM'a dokunur (ui katmanı), oyun durumunu okumaz.

const TILE_W = 128;
const TILE_H = 192;
const COLS = 4;
const ROWS = 2;
/** Aynı anda kullanılabilen farklı alev sayısı. */
export const FIRE_TILES = COLS * ROWS;
/** Kare hızı tavanı: alevin gözü 30 kareden fazlasını ayırt etmiyor. */
const MIN_STEP_S = 1 / 30;

const VERTEX = `
attribute vec2 p;
varying vec2 v;
void main() { v = p * 0.5 + 0.5; gl_Position = vec4(p, 0.0, 1.0); }`;

const FRAGMENT = `
precision highp float;
varying vec2 v;
uniform float t;
uniform vec2 grid;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float a = 0.5, s = 0.0;
  mat2 m = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 5; i++) { s += a * noise(p); p = m * p * 2.02; a *= 0.5; }
  return s;
}
void main() {
  vec2 cell = floor(v * grid);
  vec2 uv = fract(v * grid);
  float seed = cell.x + cell.y * grid.x;
  float x = (uv.x - 0.5) * 2.0;
  float y = uv.y;
  float time = t * (0.92 + 0.1 * sin(seed * 3.1)) + seed * 17.0;

  // Alev gövdesi yükseldikçe yana savrulur: alt sakin, uç kararsız.
  float warp = fbm(vec2(x * 1.4 + seed * 5.0, y * 1.5 - time * 1.1));
  x += (warp - 0.5) * (0.25 + y * 1.5);

  // Dil dil kopan biçim gürültünün yükseklikle yarışından doğar: gürültü o
  // satırın eşiğini geçen yerde alev vardır. Sütun maskesi çizilirse alev
  // düzgün bir üçgen olarak okunuyor.
  float coarse = fbm(vec2(x * 2.4 + seed * 3.0, y * 2.0 - time * 1.9) + warp * 1.6);
  float fine = fbm(vec2(x * 6.5 - seed, y * 4.6 - time * 3.4) + coarse * 1.2);
  float turb = coarse * 0.72 + fine * 0.38;
  float side = 1.0 - smoothstep(0.42, 1.0, abs(x));
  float heat = (turb * 1.5 - y * 1.08 - 0.12) * side * 2.3;
  // Taban düz kesilmez: yanlara doğru kavisli ve gürültüyle yırtık bir sınırdan
  // doğar. Sabit eşik alevin altına cetvelle çizilmiş bir çizgi bırakıyordu.
  float rim = 0.05 + 0.3 * x * x + 0.2 * fbm(vec2(x * 3.1 + seed * 7.0, time * 0.7));
  heat *= smoothstep(rim, rim + 0.2, y) * smoothstep(1.0, 0.8, y);
  heat = clamp(heat, 0.0, 1.0);

  // Beyaz yalnız en sıcak damarlarda: alevin çoğu turuncu ve yarı saydamdır.
  vec3 c = mix(vec3(0.42, 0.04, 0.0), vec3(1.0, 0.27, 0.02), smoothstep(0.08, 0.42, heat));
  c = mix(c, vec3(1.0, 0.58, 0.1), smoothstep(0.38, 0.72, heat));
  c = mix(c, vec3(1.0, 0.86, 0.46), smoothstep(0.76, 1.0, heat));
  float a = smoothstep(0.02, 0.5, heat);
  gl_FragColor = vec4(c * a, a);
}`;

let state = null;
let unavailable = false;

function compile(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  return gl.getShaderParameter(shader, gl.COMPILE_STATUS) ? shader : null;
}

function boot() {
  if (state || unavailable) return state;
  const canvas = document.createElement('canvas');
  canvas.width = TILE_W * COLS;
  canvas.height = TILE_H * ROWS;
  const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false });
  const vs = gl && compile(gl, gl.VERTEX_SHADER, VERTEX);
  const fs = gl && compile(gl, gl.FRAGMENT_SHADER, FRAGMENT);
  const program = vs && fs ? gl.createProgram() : null;
  if (program) {
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
  }
  if (!program || !gl.getProgramParameter(program, gl.LINK_STATUS)) {
    unavailable = true;
    return null;
  }
  gl.useProgram(program);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const at = gl.getAttribLocation(program, 'p');
  gl.enableVertexAttribArray(at);
  gl.vertexAttribPointer(at, 2, gl.FLOAT, false, 0, 0);
  gl.uniform2f(gl.getUniformLocation(program, 'grid'), COLS, ROWS);
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.clearColor(0, 0, 0, 0);
  state = { canvas, gl, uTime: gl.getUniformLocation(program, 't'), last: -1 };
  return state;
}

/**
 * Alev ızgarasını `t` saniyesine getirir. Çizim tamponu korunmadığı için
 * dönen tuval aynı görevde kopyalanmalıdır (drawFlame).
 * @returns {HTMLCanvasElement|null}
 */
export function fireFrame(t) {
  const fire = boot();
  if (!fire) return null;
  if (fire.gl.isContextLost()) return null;
  if (Math.abs(t - fire.last) >= MIN_STEP_S || fire.last < 0) {
    fire.last = t;
    fire.gl.clear(fire.gl.COLOR_BUFFER_BIT);
    fire.gl.uniform1f(fire.uTime, t % 1000);
    fire.gl.drawArrays(fire.gl.TRIANGLES, 0, 3);
  }
  return fire.canvas;
}

/** Bir alev karesini tabanı (x, y) olacak biçimde hedef tuvale basar. */
export function drawFlame(ctx, frame, tile, x, y, w, h) {
  const col = tile % COLS;
  const row = Math.floor(tile / COLS) % ROWS;
  ctx.drawImage(frame, col * TILE_W, row * TILE_H, TILE_W, TILE_H, x - w / 2, y - h, w, h);
}
