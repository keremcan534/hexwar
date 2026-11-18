// Dalgalanan bayrak: prosedürel bayrağın ÜSTÜNE eklenen bir yüzey efekti.
//
// Bayrak tarifi (world/flags.js) ve çizimi (flagPainter.js) DEĞİŞMEZ. Bu modül
// yalnız çizilmiş yüzeyi deforme eder: kaynak bir kez pişirilir, her karede
// yeniden örneklenir.
//
// Asıl yol GERÇEK BEZ: Blender'da simüle edilen hareket bir atlasa pişirilmiştir
// (scripts/art/flag-cloth.py). Bayraklar ulus başına üretildiği için görüntü
// değil adres pişirilir; her piksel bayrağın neresine baktığını atlastan okur.
// WebGL ya da atlas yoksa aşağıdaki şerit warp devreye girer.
//
// Neden şerit warp da CSS dönüşümü değil: bayrağı bütün olarak eğmek ya da
// döndürmek "sallanan karton tabela" veriyor. Bez izlenimi ancak YÜZEYİN
// KENDİSİ deforme olunca doğuyor.
//
// Fizik kuralı tek: genlik soldan sağa artar. Sol kenar gönderdedir, oynamaz;
// sağ kenar serbesttir, en çok o oynar. `smoothstep` ağırlığı bunu verir ve
// efekti inandırıcı kılan asıl ayrıntı budur.
//
// Bütçe: TEK requestAnimationFrame döngüsü bütün bayrakları sürer (bayrak
// başına döngü açılmaz, bkz. CLAUDE.md). Kare 30 Hz'e kısılır, sekme
// gizlenince ya da görünen bayrak kalmayınca (menü perdesi) durur, döngü
// içinde tahsis yapılmaz.

import { drawFlag } from './flagPainter.js';

/**
 * Görsel ayar sabitleri tek yerde. Oyun ayarı DEĞİLLERDİR; buradan elle
 * kalibre edilirler.
 */
const TUNE = {
  frameMs: 33,        // ~30 Hz; efekt 60 Hz istemiyor
  speed: 1.05,        // ana dalganın hızı
  freq: 2.2,          // ana dalganın uzunluğu (bayrak boyunca)
  speed2: 1.72,       // ikinci, daha hızlı kırışık
  freq2: 4.4,
  amp2: 0.28,         // ikinci dalganın payı — birinciyle asal olmayan oran
  depth: 0.035,       // şeridin dikey ezilmesi: kumaşa derinlik hissi
  shade: 0.17,        // dalgayla BİRLİKTE kayan kıvrım ışığı
  clothAlpha: 0.55,   // dokunun payı; rengi kaybettirmeyecek kadar
};

const LIGHT = '#fff4dc';
const DARK = '#000000';

/**
 * TÖREN SANCAĞI (`style: 'banner'`): vitrin ekranlarındaki büyük bayrak.
 * Şerit warp'ı iki yerde geliştirir: (1) her şerit bir eğme dönüşümüyle
 * çizilir, kenar basamaklanmaz; (2) üst ve alt kenar farklı fazda dalgalanır,
 * kıvrım eğik durur ve eğimli kumaş perspektifle daralır. Üç kenarda altın
 * saçak kaynağa pişirilir, yani kumaşla birlikte dalgalanır.
 */
const BANNER = {
  fringe: 0.068,     // saçak boyu / bez yüksekliği
  amp: 0.07,         // uçtaki dalga genliği / bez yüksekliği
  droop: 0.035,      // serbest ucun sarkması
  waves: 2.1,        // bez boyunca dalga sayısı: görünürde iki kıvrım
  speed: 1.7,        // rad/sn
  skew: 0.6,         // üst-alt kenar faz farkı: kıvrımlar eğik
  tilt: 1.15,        // eğimden daralma (ve ışık karşıtlığı)
  light: 0.45,       // kıvrımın ışık alan yüzü (krem; fazlası parlama gibi duruyor)
  shadow: 0.78,      // ışıktan kaçan yüzü
  hollow: 0.22,      // çukurun gölgesi
  stripPx: 5,        // şerit genişliği (cihaz pikseli)
  stillTime: 2.15,   // hareket kapalıyken çizilen an: kıvrımlar yine görünür
};

const FRINGE_COLORS = ['#f4dc98', '#d2a552', '#94702f', '#e6c06c'];

// <cloth-atlas> scripts/art/flag-cloth.py yazar; elle değiştirme.
const CLOTH = {
  frames: 48, columns: 8, rows: 6,
  cellW: 256, cellH: 204, gutter: 2,
  width: 2064, height: 1236,
  loopSeconds: 4.0, still: 22,
  // Çerçevenin durağan bez koordinatındaki yeri (u, v birimi).
  x0: 0.00000, y0: -0.02106, spanU: 0.96970, spanV: 1.15910,
  // R, G kanallarının çözüm aralığı.
  duMin: -0.00391, duMax: 0.13235, dvMin: -0.27829, dvMax: 0.04901,
};
// </cloth-atlas>

/** Kıvrım ışığının üssü: küçük bayrakta kıvrım az pikselde okunmak zorunda. */
const CLOTH_LIGHT = { wave: 2.6, banner: 2.4 };

const CLOTH_VERT = `
attribute vec2 aPos;
varying vec2 vP;
void main() {
  vP = vec2(aPos.x * 0.5 + 0.5, 0.5 - aPos.y * 0.5);
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const CLOTH_FRAG = `
precision highp float;
varying vec2 vP;
uniform sampler2D uAtlas;
uniform sampler2D uSrc;
uniform vec4 uBox;
uniform vec4 uRest;
uniform vec4 uDelta;
uniform vec4 uCells;
uniform vec2 uCell;
uniform vec2 uInset;
uniform vec2 uTap;
uniform float uMix;
uniform float uEdge;
uniform float uLight;

vec4 texel(vec2 f, vec2 at) {
  return texture2D(uAtlas, at + clamp(f, uInset, 1.0 - uInset) * uCell);
}

vec4 cloth(vec2 f) {
  vec4 a = texel(f, uCells.xy);
  vec4 b = texel(f, uCells.zw);
  float wa = a.a * (1.0 - uMix);
  float wb = b.a * uMix;
  float w = wa + wb;
  if (w < 0.002) return vec4(0.0);
  // Ağırlık örtüden: siluetin dışına düşen karenin adresi anlamsızdır ve
  // kenarda bayrağın başka bir yerini sızdırırdı.
  vec3 t = (a.rgb * wa + b.rgb * wb) / w;
  vec2 uv = uRest.xy + f * uRest.zw + uDelta.xy + t.rg * uDelta.zw;
  vec4 c = texture2D(uSrc, uv);
  float lit = pow(t.b * 2.0, uLight);
  float cover = clamp((w - 0.5) / uEdge + 0.5, 0.0, 1.0);
  // Kaynak önçarpımlı: ışık rengi alfanın üstüne taşırırsa saçak aralarında
  // geçersiz piksel ve parlak kenar doğar.
  return vec4(min(c.rgb * lit, vec3(c.a)), c.a) * cover;
}

void main() {
  vec2 f = (vP - uBox.xy) / uBox.zw;
  // Döndürülmüş dört örnek: atlas bayraktan büyük olduğunda kenar ve kıvrım
  // kıpırdarken karıncalanmasın. Mipmap olmaz, hücreler birbirine sızardı.
  gl_FragColor = 0.25 * (
    cloth(f + uTap * vec2(-0.375, -0.125)) + cloth(f + uTap * vec2(0.125, -0.375))
    + cloth(f + uTap * vec2(0.375, 0.125)) + cloth(f + uTap * vec2(-0.125, 0.375)));
}`;

/**
 * Bütün bayrakların ortak GL yüzeyi. Bayrak başına bağlam açılamaz: tarayıcı
 * sayfa başına ~16 bağlam tanır ve harita katmanları da oradan yer.
 */
const cloth = {
  state: 'idle',     // idle | loading | ready | failed
  canvas: null,
  gl: null,
  u: null,
  atlas: null,
  generation: 0,     // bağlam düşünce eski dokular geçersizleşir
};

function clothShader(gl, type, text) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, text);
  gl.compileShader(shader);
  return shader;
}

/** Program ve geometri; bağlam geri geldiğinde de buradan yeniden kurulur. */
function clothProgram(gl) {
  const program = gl.createProgram();
  gl.attachShader(program, clothShader(gl, gl.VERTEX_SHADER, CLOTH_VERT));
  gl.attachShader(program, clothShader(gl, gl.FRAGMENT_SHADER, CLOTH_FRAG));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return false;
  gl.useProgram(program);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const at = gl.getAttribLocation(program, 'aPos');
  gl.enableVertexAttribArray(at);
  gl.vertexAttribPointer(at, 2, gl.FLOAT, false, 0, 0);
  const u = {};
  for (const name of ['uBox', 'uCells', 'uTap', 'uMix', 'uEdge', 'uLight']) {
    u[name] = gl.getUniformLocation(program, name);
  }
  gl.uniform1i(gl.getUniformLocation(program, 'uAtlas'), 0);
  gl.uniform1i(gl.getUniformLocation(program, 'uSrc'), 1);
  gl.uniform4f(gl.getUniformLocation(program, 'uRest'), CLOTH.x0, CLOTH.y0, CLOTH.spanU, CLOTH.spanV);
  gl.uniform4f(gl.getUniformLocation(program, 'uDelta'),
    CLOTH.duMin, CLOTH.dvMin, CLOTH.duMax - CLOTH.duMin, CLOTH.dvMax - CLOTH.dvMin);
  gl.uniform2f(gl.getUniformLocation(program, 'uCell'), CLOTH.cellW / CLOTH.width, CLOTH.cellH / CLOTH.height);
  gl.uniform2f(gl.getUniformLocation(program, 'uInset'), 0.5 / CLOTH.cellW, 0.5 / CLOTH.cellH);
  gl.disable(gl.BLEND);
  gl.disable(gl.DEPTH_TEST);
  gl.enable(gl.SCISSOR_TEST);
  gl.clearColor(0, 0, 0, 0);
  cloth.u = u;
  return true;
}

function clothTexture(gl, unit) {
  const tex = gl.createTexture();
  gl.activeTexture(unit);
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return tex;
}

/**
 * Atlas RENK değil VERİDİR: önçarpım ya da renk uzayı çevirisi adresleri bozar
 * ve bayrak kayar. Saydam piksellerdeki adresler de korunmalı, kenar örneği
 * onlardan okur; bu yüzden `Image` değil ayarlı `createImageBitmap`.
 */
async function loadClothAtlas() {
  const url = new URL('../../assets/flag/cloth-atlas.png', import.meta.url);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`atlas ${response.status}`);
  const bitmap = await createImageBitmap(await response.blob(), {
    premultiplyAlpha: 'none', colorSpaceConversion: 'none',
  });
  const { gl } = cloth;
  if (!gl || gl.isContextLost()) { bitmap.close(); return; }
  cloth.atlas = clothTexture(gl, gl.TEXTURE0);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, bitmap);
  bitmap.close();
  cloth.state = 'ready';
  // Hareket kapalı bayraklar atlası beklerken şerit görünümünde basılmıştı.
  for (const flag of parked) blit(flag);
  startClock();
}

function clothFailed(reason) {
  cloth.state = 'failed';
  console.warn('[flagWave] bez atlası kullanılamıyor, şerit görünümü:', reason);
}

/** İlk hareketli bayrakta bir kez kurulur; başarısızsa şerit warp sürer. */
function ensureCloth() {
  if (cloth.state !== 'idle') return;
  cloth.state = 'loading';
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const gl = canvas.getContext('webgl', {
    alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false,
  });
  if (!gl || !clothProgram(gl)) {
    clothFailed('WebGL yok');
    return;
  }
  cloth.canvas = canvas;
  cloth.gl = gl;
  canvas.addEventListener('webglcontextlost', (event) => {
    // preventDefault olmadan tarayıcı bağlamı bir daha geri vermez.
    event.preventDefault();
    cloth.state = 'loading';
    cloth.generation++;
  });
  canvas.addEventListener('webglcontextrestored', () => {
    if (!clothProgram(gl)) { clothFailed('bağlam geri gelmedi'); return; }
    loadClothAtlas().catch((err) => clothFailed(err.message));
  });
  loadClothAtlas().catch((err) => clothFailed(err.message));
}

/** Pişmiş bayrak GL dokusuna yalnız ilk çizimde çıkar. */
function clothSource(flag) {
  const { gl } = cloth;
  if (flag.tex && flag.texGen === cloth.generation) {
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, flag.tex);
    return;
  }
  flag.tex = clothTexture(gl, gl.TEXTURE1);
  flag.texGen = cloth.generation;
  // Saçağın ip aralarında süzme koyu hale bırakmasın.
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, flag.src);
}

function releaseClothSource(flag) {
  if (flag.tex && flag.texGen === cloth.generation) cloth.gl?.deleteTexture(flag.tex);
  flag.tex = null;
}

/**
 * Atlasın `frame` anını bayrağın tuvaline basar. Komşu iki kare adres uzayında
 * karışır: görüntüyü karıştırmak armada çift kontur bırakırdı.
 */
function drawClothFrame(flag, frame) {
  if (cloth.state !== 'ready' || !flagWaveDebug.useCloth) return false;
  const { gl, canvas, u } = cloth;
  const cw = flag.canvas.width;
  const ch = flag.canvas.height;
  if (cw > canvas.width || ch > canvas.height) {
    canvas.width = Math.max(cw, canvas.width);
    canvas.height = Math.max(ch, canvas.height);
  }
  // Sancakta kare kaynağın (bez + saçak) ölçüsüyle tuvale oturur; künyede
  // tuvalin kendisidir, kap sabit ölçülü ve taşmaya kapalıdır.
  let bx = 0;
  let by = 0;
  let bw = cw;
  let bh = ch;
  if (flag.style === 'banner') {
    const { src, geo } = flag;
    bw = src.width * CLOTH.spanU;
    bh = src.height * CLOTH.spanV;
    bx = -CLOTH.x0 * src.width;
    by = geo.oy - geo.F + CLOTH.y0 * src.height;
  }
  const whole = Math.floor(frame);
  const a = ((whole % CLOTH.frames) + CLOTH.frames) % CLOTH.frames;
  const b = (a + 1) % CLOTH.frames;
  const pitchX = (CLOTH.cellW + CLOTH.gutter) / CLOTH.width;
  const pitchY = (CLOTH.cellH + CLOTH.gutter) / CLOTH.height;

  gl.viewport(0, canvas.height - ch, cw, ch);
  gl.scissor(0, canvas.height - ch, cw, ch);
  gl.clear(gl.COLOR_BUFFER_BIT);
  clothSource(flag);
  gl.uniform4f(u.uBox, bx / cw, by / ch, bw / cw, bh / ch);
  gl.uniform4f(u.uCells,
    (a % CLOTH.columns) * pitchX, Math.floor(a / CLOTH.columns) * pitchY,
    (b % CLOTH.columns) * pitchX, Math.floor(b / CLOTH.columns) * pitchY);
  gl.uniform1f(u.uMix, frame - whole);
  // Örnek yayılımı en az bir atlas tekseli: 8 bit adresin basamağı da süzülür.
  gl.uniform2f(u.uTap, Math.max(1 / bw, 1 / CLOTH.cellW), Math.max(1 / bh, 1 / CLOTH.cellH));
  // Atlas büyütülürse örtü geçişi de büyür; kenar bir buçuk piksele sıkıştırılır.
  gl.uniform1f(u.uEdge, Math.min(1, (0.75 * CLOTH.cellW) / bw));
  gl.uniform1f(u.uLight, flag.style === 'banner' ? CLOTH_LIGHT.banner : CLOTH_LIGHT.wave);
  gl.drawArrays(gl.TRIANGLES, 0, 3);

  flag.ctx.clearRect(0, 0, cw, ch);
  flag.ctx.drawImage(canvas, 0, 0, cw, ch, 0, 0, cw, ch);
  return true;
}

/** Her ulus döngünün başka yerinde: yan yana iki bayrak aynı anda dalgalanmasın. */
function clothPhase(nation) {
  return ((Number(nation.id) || 0) * 0.61803398875) % 1;
}

/**
 * KUMAŞ DOKUSU: çalışma anında üretilen düz dokuma (bez ayağı), gri ve
 * ortalaması 128 — `overlay` altında nötr, rengi kaydırmaz.
 *
 * Eski doku bir fotoğraftı (assets/flag/cloth.png) ve içine kıvrım ile
 * çatlak basılıydı: dalgalanan bezde o kıvrımlar yerinde durup kumaş
 * altından kayıyordu, büyük bayrakta da kâğıt gibi çatlak görünüyordu.
 * Kıvrımı artık yalnız dalga çizer; doku iplik, boya ve elyaf taşır.
 *
 * Bayrağın kendi piksel boyunda üretilir (ölçeklenen dokuma hare yapar) ve
 * boya göre önbelleklenir: ekranlar her tazelemede bayrağı yeniden pişirir.
 */
const WEAVE = {
  thread: 3,       // iplik aralığı (cihaz pikseli)
  contrast: 54,    // iplik kabartısının gri genliği
  slub: 0.16,      // iplikten ipliğe kalınlık/ton farkı
  mottle: 0.34,    // boya dalgalanması (büyük ölçek)
  fiber: 0.12,     // elyaf kumlanması (piksel)
};
const weaves = new Map();

function weaveTexture(width, height) {
  const key = `${width}x${height}`;
  const hit = weaves.get(key);
  if (hit) return hit;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, width);
  canvas.height = Math.max(1, height);
  const ctx = canvas.getContext('2d');
  const image = ctx.createImageData(canvas.width, canvas.height);
  const data = image.data;
  let seed = 0x2f6b9e1d;
  const rnd = () => {
    seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
    return (seed >>> 0) / 4294967296;
  };
  const P = WEAVE.thread;
  const cols = Math.ceil(canvas.width / P) + 1;
  const rows = Math.ceil(canvas.height / P) + 1;
  // Düzensiz iplik: her iplik kendi tonunda, arada bir kalın düğüm (slub).
  const yarn = (n) => Float32Array.from({ length: n }, () => (
    (rnd() - 0.5) * WEAVE.slub + (rnd() < 0.05 ? (rnd() - 0.5) * WEAVE.slub * 2.2 : 0)));
  const warp = yarn(cols);
  const weft = yarn(rows);
  // Boya dalgalanması: kaba ızgarada değer gürültüsü, çift doğrusal.
  const G = 28;
  const gw = Math.ceil(canvas.width / G) + 2;
  const gh = Math.ceil(canvas.height / G) + 2;
  const grid = Float32Array.from({ length: gw * gh }, () => rnd() - 0.5);
  const smooth = (t) => t * t * (3 - 2 * t);
  const profile = Float32Array.from({ length: P }, (_, k) => Math.sin(Math.PI * (k + 0.5) / P));
  for (let y = 0; y < canvas.height; y++) {
    const j = (y / P) | 0;
    const py = profile[y % P];
    const gy = y / G;
    const gy0 = gy | 0;
    const ty = smooth(gy - gy0);
    for (let x = 0; x < canvas.width; x++) {
      const i = (x / P) | 0;
      const px = profile[x % P];
      // Bez ayağı: çözgü ve atkı damalı sırayla üste çıkar; üstteki iplik
      // ortasından ışık alır, kesişme ucunda gölgeye girer.
      const v = ((i + j) & 1) === 0
        ? px * (0.8 + 0.2 * py) + warp[i]
        : py * (0.8 + 0.2 * px) + weft[j];
      const gx = x / G;
      const gx0 = gx | 0;
      const tx = smooth(gx - gx0);
      const k = gy0 * gw + gx0;
      const mottle = (grid[k] * (1 - tx) + grid[k + 1] * tx) * (1 - ty)
        + (grid[k + gw] * (1 - tx) + grid[k + gw + 1] * tx) * ty;
      const g = 128 + (v - 0.6 + mottle * WEAVE.mottle + (rnd() - 0.5) * WEAVE.fiber) * WEAVE.contrast;
      const o = (y * canvas.width + x) * 4;
      data[o] = data[o + 1] = data[o + 2] = g < 0 ? 0 : g > 255 ? 255 : g;
      data[o + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  weaves.set(key, canvas);
  return canvas;
}

/** Şu an sürülen bayraklar. */
const live = new Set();
/** Hareket kapalıyken bekleyen (büyük ama duran) bayraklar; ayar açılınca canlanır. */
const parked = new Set();
let rafId = 0;
let timerId = 0;
let lastFrame = 0;

/** Görünürlük: ekrandan çıkan bayrak çizilmez; geri girince saat yeniden kurulur. */
const seen = typeof IntersectionObserver === 'function'
  ? new IntersectionObserver((entries) => {
    let back = false;
    for (const entry of entries) {
      const flag = entry.target.__flag;
      if (!flag) continue;
      flag.visible = entry.isIntersecting;
      back ||= entry.isIntersecting;
    }
    if (back) startClock();
  }, { threshold: 0 })
  : null;

/**
 * Bayrak gerçekten görünüyor mu? IntersectionObserver `visibility: hidden`ı
 * görmez: ana menü künyeyi bu yolla gizlerken bayrak saniyede 30 kez boşuna
 * çiziliyor ve döngü her karede rAF istiyordu (ölçüldü: menü açıkken 2 sn'de
 * 448 drawImage). checkVisibility yoksa (eski tarayıcı) eski davranış kalır.
 */
function shown(flag) {
  return flag.visible
    && flag.canvas.checkVisibility?.({ visibilityProperty: true }) !== false;
}

/**
 * Görsel kalibrasyon kancası. Oyun ayarı DEĞİLDİR ve arayüzden erişilmez;
 * sabitleri konsoldan kurcalamak ve hareketi kapalı makinede efekti bir kez
 * görebilmek içindir.
 */
export const flagWaveDebug = {
  tune: TUNE,
  forceMotion: false,
  useCloth: true,
  cloth,
  drawClothFrame: (flag, frame) => drawClothFrame(flag, frame),
};

/**
 * Hareket OYUNUN ayarıdır (Settings → Interface animations, kök
 * `data-motion`), sistemin "hareketi azalt" bayrağı değil: Kerem'in
 * Windows'unda animasyon efektleri kapalı ve medya sorgusuna bakan bayrak
 * onda hiç dalgalanmıyordu.
 */
function reducedMotion() {
  if (flagWaveDebug.forceMotion) return false;
  return typeof document !== 'undefined'
    && document.documentElement?.dataset?.motion === 'off';
}

function loop(now) {
  rafId = 0;
  lastFrame = now;
  const time = now / 1000;
  let drawn = 0;
  for (const flag of live) if (draw(flag, time)) drawn++;
  // Görünen bayrak kalmadıysa saat DURUR: gizli bayrak için her karede rAF
  // istemek sürekli döngü demekti (bkz. CLAUDE.md). Perde kalkınca sınıf
  // gözcüsü, ekrana geri giren bayrak için görünürlük gözcüsü yeniden kurar.
  if (!drawn) return;
  schedule();
}

/**
 * Sonraki kare zamanlayıcıyla beklenir, rAF yalnız çizim anında istenir.
 * Eskiden döngü her vsync'te rAF'ı yeniden kuruyor, 33 ms dolmadıysa boş
 * dönüyordu: üst çubuktaki bayrak hep görünür olduğundan oyun duraklatılmış
 * ve fare kıpırdamıyorken bile sayfa her vsync'te (60-144/sn) kare ve stil
 * hesabı üretiyordu (ölçüldü: 5 sn'de 1161-1203 geri çağrı). Şimdi ~30/sn.
 */
function schedule() {
  const wait = Math.max(0, TUNE.frameMs - (performance.now() - lastFrame));
  timerId = setTimeout(() => {
    timerId = 0;
    rafId = requestAnimationFrame(loop);
  }, wait);
}

function startClock() {
  if (rafId || timerId || document.hidden || !live.size) return;
  rafId = requestAnimationFrame(loop);
}

function stopClock() {
  clearTimeout(timerId);
  cancelAnimationFrame(rafId);
  timerId = 0;
  rafId = 0;
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopClock();
    else startClock();
  });
  // Ayar oyun sırasında çevrilir: takılı bayraklar yeniden takılmadan
  // durur ya da kıpırdamaya başlar.
  if (typeof MutationObserver === 'function') {
    new MutationObserver(() => {
      const still = reducedMotion();
      for (const flag of [...live, ...parked]) {
        if (flag.fixed) continue;
        flag.static = still;
        if (still) {
          blit(flag);
          live.delete(flag);
          parked.add(flag);
        } else if (flag.canvas.isConnected && !flag.fixed) {
          parked.delete(flag);
          live.add(flag);
        }
      }
      if (still) stopClock();
      else startClock();
    }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-motion'] });
    // Perdeler (ana menü, ekranlar) gövde sınıfıyla açılıp kapanır ve
    // IntersectionObserver `visibility` değişimini bildirmez: gizli bayrakta
    // duran saat, perde kalkınca buradan yeniden kurulur.
    if (document.body) {
      new MutationObserver(() => startClock())
        .observe(document.body, { attributes: true, attributeFilter: ['class'] });
    }
  }
}

/**
 * Kaynağı pişirir: bayrak + kumaş dokusu, TEK SEFER. Karede yeniden
 * üretilmez — dalgalanma yalnız bu hazır yüzeyi kaydırır.
 */
function bake(flag) {
  if (flag.style === 'banner') bakeBanner(flag);
  else if (flag.style === 'crest') bakeCrest(flag);
  else bakeWave(flag);
  if (flag.static) blit(flag);
}

function bakeWave(flag) {
  const ctx = flag.src.getContext('2d');
  ctx.clearRect(0, 0, flag.w, flag.h);
  drawFlag(ctx, flag.nation.flag, 0, 0, flag.w, flag.h);
  // Gri doku `overlay` ile biner: 128 nötr olduğu için renk kaymaz,
  // yalnız dokunun açık yerleri açar, koyu yerleri koyultur.
  clothOver(ctx, 0, 0, flag.w, flag.h, TUNE.clothAlpha);
}

/** Kumaş dokusu: bayrağın kendi alanına `overlay` ile biner. */
function clothOver(ctx, x, y, w, h, alpha) {
  ctx.globalCompositeOperation = 'overlay';
  ctx.globalAlpha = alpha;
  ctx.drawImage(weaveTexture(Math.round(w), Math.round(h)), x, y, w, h);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}

/**
 * Sancak kaynağı: bez + doku + dikiş payı + üç kenarda saçak. Kaynak bezden
 * saçak boyu kadar geniş ve iki saçak boyu kadar yüksektir; dalgalanma
 * bütün kaynağı kaydırdığı için saçak kumaşa yapışık kalır.
 */
function bakeBanner(flag) {
  const { geo } = flag;
  const { cw, ch, F, dpr } = geo;
  const ctx = flag.src.getContext('2d');
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.clearRect(0, 0, flag.src.width, flag.src.height);
  drawFlag(ctx, flag.nation.flag, 0, F, cw, ch, { frame: false });
  clothOver(ctx, 0, F, cw, ch, 0.7);
  // Bezin alt yarısı hafif gölgede (ağırlığıyla sarkan kumaş). Üste ışık
  // konmaz: krem tül "ışıma" gibi duruyordu.
  const sky = ctx.createLinearGradient(0, F, 0, F + ch);
  sky.addColorStop(0, 'rgba(0, 0, 0, 0)');
  sky.addColorStop(0.5, 'rgba(0, 0, 0, 0)');
  sky.addColorStop(1, 'rgba(0, 0, 0, 0.18)');
  ctx.globalCompositeOperation = 'source-atop';
  ctx.fillStyle = sky;
  ctx.fillRect(0, F, cw, ch);
  // Dikiş payı: kenarda ince koyu hat.
  ctx.globalCompositeOperation = 'source-over';
  ctx.lineWidth = 1.2 * dpr;
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.32)';
  ctx.strokeRect(0.6 * dpr, F + 0.6 * dpr, cw - 1.2 * dpr, ch - 1.2 * dpr);
  drawFringe(ctx, geo);
}

/**
 * Altın saçak: örgü şerit + dışa sarkan ipler. İp boyu deterministik
 * "rastgele" (aynı bayrak her pişişte aynı); renk başına tek yol çizilir.
 */
function drawFringe(ctx, { cw, ch, F, dpr }) {
  const braid = Math.max(2, Math.round(F * 0.32));
  const thread = F - braid;
  const step = Math.max(1.3, 1.15 * dpr);
  let seed = 9173;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const paths = FRINGE_COLORS.map(() => new Path2D());
  let n = 0;
  // Üst ve alt kenar: ipler kenara dik, uç köşeye kadar.
  for (let x = step * 0.5; x < cw + braid; x += step, n++) {
    const p = paths[n % paths.length];
    const top = thread * (0.78 + 0.22 * rnd());
    const bottom = thread * (0.78 + 0.22 * rnd());
    const lean = (rnd() - 0.5) * dpr * 0.8;
    p.moveTo(x, F - braid); p.lineTo(x + lean, F - braid - top);
    p.moveTo(x, F + ch + braid); p.lineTo(x - lean, F + ch + braid + bottom);
  }
  // Uç kenar: ipler yatay.
  for (let y = F - braid + step * 0.5; y < F + ch + braid; y += step, n++) {
    const p = paths[n % paths.length];
    const len = thread * (0.78 + 0.22 * rnd());
    p.moveTo(cw + braid, y); p.lineTo(cw + braid + len, y + (rnd() - 0.5) * dpr * 0.8);
  }
  ctx.globalCompositeOperation = 'source-over';
  ctx.lineWidth = Math.max(1, 0.85 * dpr);
  ctx.lineCap = 'round';
  paths.forEach((path, i) => { ctx.strokeStyle = FRINGE_COLORS[i]; ctx.stroke(path); });

  // Örgü şerit: bezi saçağa bağlayan altın kordon, burgu çentikleriyle.
  const gold = (x0, y0, x1, y1) => {
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0, '#7a5a24');
    g.addColorStop(0.45, '#f3d996');
    g.addColorStop(1, '#8a6a2e');
    return g;
  };
  ctx.fillStyle = gold(0, F - braid, 0, F);
  ctx.fillRect(0, F - braid, cw + braid, braid);
  ctx.fillStyle = gold(0, F + ch, 0, F + ch + braid);
  ctx.fillRect(0, F + ch, cw + braid, braid);
  ctx.fillStyle = gold(cw, 0, cw + braid, 0);
  ctx.fillRect(cw, F - braid, braid, ch + braid * 2);
  const ticks = new Path2D();
  const tick = braid * 1.1;
  for (let x = 0; x < cw; x += tick) {
    ticks.moveTo(x, F); ticks.lineTo(x + braid * 0.7, F - braid);
    ticks.moveTo(x, F + ch + braid); ticks.lineTo(x + braid * 0.7, F + ch);
  }
  for (let y = F - braid; y < F + ch + braid; y += tick) {
    ticks.moveTo(cw, y); ticks.lineTo(cw + braid, y + braid * 0.7);
  }
  ctx.strokeStyle = 'rgba(60, 40, 12, 0.55)';
  ctx.lineWidth = Math.max(0.8, 0.6 * dpr);
  ctx.stroke(ticks);
}

/**
 * Arma (`style: 'crest'`): küçük ilişki bayrakları için durağan görünüm —
 * dokuma kumaş ve hafif kenar kararması. Parlama/cam yansıması bilerek yok
 * (Kerem: "ışıma efekti çok kötü duruyor"). Bir kez pişer, hiç kıpırdamaz.
 */
function bakeCrest(flag) {
  const { w, h } = flag;
  const ctx = flag.src.getContext('2d');
  ctx.clearRect(0, 0, w, h);
  drawFlag(ctx, flag.nation.flag, 0, 0, w, h);
  clothOver(ctx, 0, 0, w, h, 0.45);
  ctx.globalCompositeOperation = 'source-atop';
  const edge = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.75);
  edge.addColorStop(0, 'rgba(0, 0, 0, 0)');
  edge.addColorStop(1, 'rgba(0, 0, 0, 0.3)');
  ctx.fillStyle = edge;
  ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = 'source-over';
}

/** Hareketsiz durum: kaynağı olduğu gibi bas (sancak donmuş bir an çizer). */
function blit(flag) {
  if (!flag.fixed && drawClothFrame(flag, CLOTH.still)) {
    // Duran bayrak bir daha çizilmez: dokusu GPU'da boşuna beklemesin.
    releaseClothSource(flag);
    return;
  }
  if (flag.style === 'banner') {
    drawBanner(flag, BANNER.stillTime);
    return;
  }
  flag.ctx.clearRect(0, 0, flag.w, flag.h);
  flag.ctx.drawImage(flag.src, 0, 0);
}

/**
 * Sancağın bir karesi. Önce şerit sınırları (konum, üst/alt kenar, ışık)
 * hesaplanır, sonra her şerit kendi eğme dönüşümüyle basılır, en son ışık
 * tek gradyanla biner. Karede bir gradyan tahsis edilir (CanvasGradient
 * değişmez); ekranda tek sancak olduğu için bedeli yok sayılabilir.
 */
function drawBanner(flag, time) {
  const { ctx, src, geo } = flag;
  const { cw, ch, F, A, D, ox, oy, n, xs, tops, bots, lums, hollows } = geo;
  const total = cw + F;
  const sh = ch + 2 * F;
  const sw = total / n;
  const k = Math.PI * 2 * BANNER.waves;
  const t = time * BANNER.speed;
  for (let j = 0; j <= n; j++) {
    const xn = (j * sw) / total;
    const weight = xn * xn * (3 - 2 * xn);
    const phase = k * xn - t;
    const s = Math.sin(phase);
    const sag = D * xn * xn;
    tops[j] = oy - F + A * weight * s + sag;
    bots[j] = oy + ch + F + A * weight * Math.sin(phase - BANNER.skew) + sag * 1.6;
    // Kumaşın bakış doğrultusuna eğimi: daralma ve ışık bundan doğar.
    const slope = BANNER.tilt * weight * Math.cos(phase);
    const norm = Math.sqrt(1 + slope * slope);
    lums[j] = (0.55 * slope + 0.83) / norm - 0.83;
    hollows[j] = weight * Math.max(0, -s);
    xs[j + 1] = (j === 0 ? ox : xs[j]) + sw / norm;
  }
  xs[0] = ox;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.clearRect(0, 0, flag.canvas.width, flag.canvas.height);
  for (let i = 0; i < n; i++) {
    const x0 = xs[i];
    const t0 = tops[i];
    ctx.setTransform((xs[i + 1] - x0) / sw, (tops[i + 1] - t0) / sw, 0, (bots[i] - t0) / sh, x0, t0);
    // +0.9: şeritler arası yarım piksel dikiş kalmasın.
    ctx.drawImage(src, i * sw, 0, sw, sh, 0, 0, sw + 0.9, sh);
  }
  // Parlama (saten) yok: kumaşın üstüne beyaz bant ışıma gibi duruyordu.
  // IŞIK TEK GEÇİŞTE: ışık yalnız x'e bağlı (şeritler dikey), yani şerit
  // sınırlarında durak taşıyan yatay bir gradyan bezi tam izler. Şerit başına
  // boyamak bindirme payında ince çizgiler bırakıyordu. `source-atop`:
  // saçağın ip aralarına boya sürülmez.
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const x0 = xs[0];
  const span = Math.max(1, xs[n] - x0);
  const shade = ctx.createLinearGradient(x0, 0, xs[n], 0);
  for (let j = 0; j <= n; j++) {
    const at = Math.min(1, Math.max(0, (xs[j] - x0) / span));
    const lum = lums[j];
    const dark = Math.min(0.62, Math.max(0, -lum) * BANNER.shadow + hollows[j] * BANNER.hollow);
    const light = Math.max(0, lum) * BANNER.light;
    shade.addColorStop(at, dark > light
      ? `rgba(0,0,0,${(dark - light).toFixed(3)})`
      : `rgba(255,244,220,${(light - dark).toFixed(3)})`);
  }
  ctx.globalCompositeOperation = 'source-atop';
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, flag.canvas.width, flag.canvas.height);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  return true;
}

function draw(flag, time) {
  // DOM'dan koparılmış bayrak kendini siler: ekranlar gövdeyi innerHTML ile
  // yeniliyor, ayrı bir sökme çağrısına bel bağlanamaz.
  if (!flag.canvas.isConnected) {
    live.delete(flag);
    releaseClothSource(flag);
    if (seen) seen.unobserve(flag.canvas);
    if (!live.size) stopClock();
    return false;
  }
  if (!shown(flag)) return false;
  const turn = time / CLOTH.loopSeconds + flag.phase;
  if (drawClothFrame(flag, (turn - Math.floor(turn)) * CLOTH.frames)) return true;
  if (flag.style === 'banner') return drawBanner(flag, time);

  const { ctx, src, w, h, strips, amp } = flag;
  const sw = w / strips;
  ctx.clearRect(0, 0, w, h);
  for (let i = 0; i < strips; i++) {
    const sx = i * sw;
    const xn = (sx + sw * 0.5) / w;
    // smoothstep(0,1,x): ilk %15 neredeyse durur, sağ kenar tam genlik alır.
    const weight = xn * xn * (3 - 2 * xn);
    const phase = time * TUNE.speed + xn * TUNE.freq;
    const wave = Math.sin(phase)
      + TUNE.amp2 * Math.sin(time * TUNE.speed2 + xn * TUNE.freq2);
    const offset = wave * amp * weight;
    const squash = 1 - TUNE.depth * Math.cos(phase) * weight;
    const dh = h * squash;
    const dy = offset + (h - dh) * 0.5;
    // +1: şeritler arasında yarım piksel dikiş kalmasın.
    // globalAlpha HER ŞERİTTE 1'e döner: gölge için kısılan saydamlık bir
    // sonraki şeridin kendisine sızarsa bayrak soluklaşarak kayboluyor.
    ctx.globalAlpha = 1;
    ctx.drawImage(src, sx, 0, sw, h, sx, dy, sw + 1, dh);

    // Kıvrım ışığı dalganın TÜREVİYLE gider, yani parlaklık kumaşla birlikte
    // kayar. Sabit bir doku fotoğrafı üstte dururken yüzey altında oynasaydı
    // "bez" değil "bozulmuş resim" okunurdu.
    const lum = Math.cos(phase) * weight;
    ctx.globalAlpha = Math.abs(lum) * TUNE.shade;
    ctx.fillStyle = lum > 0 ? LIGHT : DARK;
    ctx.fillRect(sx, dy, sw + 1, dh);
  }
  ctx.globalAlpha = 1;
  return true;
}

/**
 * Bayrağı bir kaba tak. Aynı kap ikinci kez çağrılırsa canvas yeniden
 * kullanılır; ulus ya da ölçü değişmediyse hiçbir şey yapılmaz.
 *
 * @param {HTMLElement} host kabı — içine canvas konur
 * @param {object} nation `nation.flag` tarifini taşıyan ulus
 * @param {number} cssW CSS pikseli genişlik
 * @param {number} cssH CSS pikseli yükseklik — sancakta BEZİN ölçüsü; saçak
 *   ve dalga payı kabın dışına taşar (canvas üstten negatif payla oturur,
 *   bezin göndere bağlı köşesi kabın sol üst köşesindedir)
 * @param {'wave'|'banner'|'crest'} style
 */
export function mountFlag(host, nation, cssW, cssH, style = 'wave') {
  if (!host || !nation?.flag) return null;

  // Kap arayüz ölçeğiyle yakınlaştırılmışsa (ui/uiScale.js, 1440p'de 1.33)
  // bez o ölçekte görünür: tuval yoğunluğu da onunla çarpılır, yoksa bayrak
  // büyütülmüş bulanık bir resim olurdu. Tuvalin CSS ölçüsü yine yerel px.
  const dpr = Math.min(2, window.devicePixelRatio || 1) * Math.min(2, host.currentCSSZoom || 1);
  const w = Math.round(cssW * dpr);
  const h = Math.round(cssH * dpr);

  let flag = host.__flag;
  if (flag && flag.nation === nation && flag.w === w && flag.h === h && flag.style === style) return flag;

  let canvas = flag?.canvas;
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.className = 'flag-canvas';
    host.replaceChildren(canvas);
  }

  // Sancak: tuval bezden büyük (saçak + dalga + sarkma payı).
  let geo = null;
  let canvasW = w;
  let canvasH = h;
  if (style === 'banner') {
    const F = Math.round(cssH * BANNER.fringe) * dpr;
    const A = cssH * BANNER.amp * dpr;
    const D = cssH * BANNER.droop * dpr;
    const top = F + A + 2 * dpr;
    const n = Math.ceil((w + F) / BANNER.stripPx);
    geo = {
      cw: w, ch: h, F, A, D, dpr, n, ox: 0, oy: top,
      xs: new Float32Array(n + 2), tops: new Float32Array(n + 1), bots: new Float32Array(n + 1),
      lums: new Float32Array(n + 1), hollows: new Float32Array(n + 1),
    };
    canvasW = w + F + 2 * dpr;
    // Simüle bez şerit dalgadan fazla sarkar; pay iki yolun büyüğüne göre.
    const clothBottom = top - F + (CLOTH.y0 + CLOTH.spanV) * (h + 2 * F);
    canvasH = Math.ceil(Math.max(top + h + F + A + D * 1.6, clothBottom) + 2 * dpr);
    canvas.style.marginTop = `${-top / dpr}px`;
  } else {
    canvas.style.marginTop = '';
  }
  canvas.width = canvasW;
  canvas.height = canvasH;
  canvas.style.width = `${canvasW / dpr}px`;
  canvas.style.height = `${canvasH / dpr}px`;

  // LOD: oyuncunun göremeyeceği yere iş yapılmaz.
  //   < 30px  — kıpırtı fark edilmez, hareketsiz bas
  //   < 56px  — 8 şerit, çok küçük genlik
  //   üstü    — 14 şerit, tam kumaş
  // Arma hiç kıpırdamaz: küçük ve çok sayıda, cam gibi durması istenir.
  const tiny = cssW < 30;
  const fixed = tiny || style === 'crest';
  const still = fixed || reducedMotion();
  const small = cssW < 56;
  const strips = small ? 8 : 14;
  const ampCss = small ? Math.min(1.2, cssH * 0.035) : Math.min(5, cssH * 0.05);

  const src = flag?.src ?? document.createElement('canvas');
  src.width = style === 'banner' ? w + geo.F : w;
  src.height = style === 'banner' ? h + 2 * geo.F : h;

  // Aynı kabın eski kaydı iki kümeden de düşer: yeniden takılan bayrak
  // eski nesneyle birlikte ikinci kez sürülmesin.
  if (host.__flag) {
    live.delete(host.__flag);
    parked.delete(host.__flag);
    releaseClothSource(host.__flag);
  }
  if (!fixed) ensureCloth();
  flag = {
    canvas, ctx: canvas.getContext('2d'), src,
    nation, w, h, strips, style, geo,
    amp: ampCss * dpr,
    static: still,
    tiny,
    fixed,
    visible: true,
    phase: clothPhase(nation),
    tex: null,
    texGen: -1,
  };
  host.__flag = flag;
  canvas.__flag = flag;
  bake(flag);

  for (const old of parked) if (!old.canvas.isConnected) parked.delete(old);
  if (still) {
    // Durağanlar da park edilir: hareket ayarı açılınca canlanabilsinler.
    if (!fixed) parked.add(flag);
    return flag;
  }
  live.add(flag);
  if (seen) seen.observe(canvas);
  startClock();
  return flag;
}

/**
 * HTML dizesiyle kurulan ekranlar için: `data-flag-nation` taşıyan kapları
 * bulup bayrağı takar. Ekran gövdesi her tazelemede baştan kurulduğu için
 * her tazelemeden sonra çağrılır.
 */
export function hydrateFlags(root, nations) {
  if (!root) return;
  for (const host of root.querySelectorAll('[data-flag-nation]')) {
    const nation = nations?.[Number(host.dataset.flagNation)];
    if (!nation) continue;
    mountFlag(host, nation,
      Number(host.dataset.flagW) || 64, Number(host.dataset.flagH) || 42, host.dataset.flagStyle || 'wave');
  }
}
