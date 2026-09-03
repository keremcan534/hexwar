// DENİZ — WebGL2 katmanı (hibrit).
//
// Haritanın geri kalanı Canvas2D'de kalır: kara, ülke, sınır, ızgara, etiket,
// birim, seçim, arayüz. Bu dosya YALNIZ suyu çizer ve Canvas2D tuvalinin
// ALTINDAKİ ayrı bir tuvale çizer. Canvas2D tarafı deniz karelerini boş
// bırakır (bkz. renderer.glWater), su oradan görünür ve kara doğal olarak
// suyun üstünü kapatır — kare başına binlerce hexlik kırpma yolu yok.
//
// Neden GPU'ya taşındı: Canvas2D'de su malzemesi ancak ÖNCEDEN PİŞMİŞ bir
// rastere yazılabiliyordu, yani çözünürlüğü sabitti (hex başına 4 teksel) ve
// hareket ancak doku kaydırmakla taklit edilebiliyordu. Işığın dalga
// eğiminden hesaplanması — Fresnel, spekülar, hareketli normaller — piksel
// başına iş ister; bu, fragment shader'ın tam olarak var olduğu şeydir.
// Kara malzemesi için aynı gerekçe YOKTU ve orası Canvas2D'de kaldı.
//
// Katman notu: DOM ve GPU'ya dokunur, oyun durumuna dokunmaz.

import { SQRT3 } from '../core/hex.js';
import { HEX_SIZE } from '../world/worldgen.js';
import { makeRng, fbm } from './textures.js';

const HEX_STEP = SQRT3 * HEX_SIZE;
const ROW_H = HEX_SIZE * 1.5;
const WRAP_X0 = -HEX_STEP / 2;

/** Kıyı uzaklığı dokusunun tavanı (dünya birimi). Ötesi "açık deniz". */
const DIST_MAX = HEX_STEP * 9;
/** Dalga dokusunun kenarı. 256 döşeme izini gizlemeye yetiyor (üç ölçek). */
const WAVE_SIZE = 256;
/** Su en fazla bu sıklıkta güncellenir (ms). Hareket zaten yavaş. */
const FRAME_MS = 33;

const VERT = `#version 300 es
// Tek üçgen tüm ekranı kaplar: dörtgene göre bir vertex az, kenar dikişi yok.
void main() {
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;
out vec4 fragColor;

uniform vec2 uViewport;     // CSS piksel
uniform float uDpr;
uniform vec2 uCam;          // dünya merkezi
uniform float uZoom;
uniform float uTime;        // saniye
uniform float uWrap;        // sarmal periyodu (0 = yok)
uniform vec2 uGrid;         // cols, rows
uniform float uHexSize;
uniform vec2 uFieldOrigin;  // uDist dokusunun dünya sol-üstü
uniform vec2 uFieldSpan;    // uDist dokusunun dünya en/boyu
uniform float uDistMax;     // uDist'in kodladığı azami uzaklık
uniform float uDetail;      // 0..1, zoom LOD

// Palet CANLI AYARLANABİLİR (bkz. WaterGL.tune). Denizin karakteri saf ayar
// meselesi ve her denemede sayfayı yeniden yükleyip dünyayı yeniden pişirmek
// 25 saniye tutuyordu; uniform olarak saniyeler içinde denenebiliyor.
uniform vec3 uShallow;
uniform vec3 uTeal;
uniform vec3 uPetrol;
uniform vec3 uAbyss;
uniform float uShelf;       // sığlık erimi çarpanı
uniform float uSpecAmp;
uniform float uFresAmp;
uniform float uFoamAmp;

uniform sampler2D uHex;     // R8, NEAREST — 1 = su
uniform sampler2D uDist;    // R8, LINEAR  — kıyıya uzaklık / uDistMax
uniform sampler2D uWave;    // RGBA8, LINEAR, tekrar — RG normal.xy, B/A yükseklik

const float SQ3 = 1.7320508;

/** Dünya noktasının hangi hexe düştüğü — ANALİTİK, dolayısıyla tam. */
vec2 hexAt(vec2 w) {
  float r = (w.y * 2.0) / (3.0 * uHexSize);
  float q = w.x / (SQ3 * uHexSize) - r * 0.5;
  // Küp yuvarlama: üç eksenden en çok sapan yeniden türetilir.
  float x = q, z = r, y = -q - r;
  float rx = floor(x + 0.5), ry = floor(y + 0.5), rz = floor(z + 0.5);
  float dx = abs(rx - x), dy = abs(ry - y), dz = abs(rz - z);
  if (dx > dy && dx > dz) rx = -ry - rz;
  else if (dy > dz) ry = -rx - rz;
  else rz = -rx - ry;
  // axial -> offset (bkz. core/hex.axialToOffset)
  return vec2(rx + floor(rz * 0.5), rz);
}

/** Dalga dokusundan normal ve yükseklik; dünya uzayında, kayan. */
vec4 wave(vec2 w, float scale, vec2 vel, float rot) {
  float c = cos(rot), s = sin(rot);
  vec2 p = mat2(c, -s, s, c) * w;
  vec2 uv = (p + vel * uTime) / scale;
  return texture(uWave, uv);
}

void main() {
  vec2 px = gl_FragCoord.xy / uDpr;
  // Canvas2D ile aynı eksen: y aşağı.
  vec2 scr = vec2(px.x, uViewport.y - px.y);
  vec2 world = (scr - uViewport * 0.5) / uZoom + uCam;

  // --- KARA MASKESİ (tam hex kenarı) ---
  vec2 cr = hexAt(world);
  float col = cr.x;
  float row = cr.y;
  if (uWrap > 0.0) col = mod(col, uGrid.x);
  if (row < 0.0 || row > uGrid.y - 1.0) discard;
  float isWater = texture(uHex, (vec2(col, row) + 0.5) / uGrid).r;
  if (isWater < 0.5) discard;

  // --- KIYI UZAKLIĞI ---
  vec2 fuv = (world - uFieldOrigin) / uFieldSpan;
  float dist = texture(uDist, fuv).r * uDistMax;

  // --- ÇOK GENİŞ ÖLÇEKLİ YAPI ---
  // Açık deniz kıyı görünmeden de derin okunmalı: kıta boyunda karanlık ve
  // aydınlık kuşaklar. Alan bulut lekesi olmasın diye alan BÜKÜLÜR (domain
  // warp): iki düşük frekans birbirini kaydırır, sonuç akıntı gibi uzar.
  vec2 warp = (wave(world, 5200.0, vec2(0.0), 0.0).ba - 0.5) * 900.0;
  float broad = wave(world + warp, 3100.0, vec2(1.1, -0.7), 0.4).b;
  broad = broad * 2.0 - 1.0;

  // --- DERİNLİK PALETİ ---
  // Kıyıdan açığa: kısık turkuaz-yeşil → derin teal → petrol → siyaha yakın
  // lacivert-teal. Parlak camgöbeği ve tropik doygunluk YOK.
  float t = clamp(dist / (uHexSize * 9.0 * uShelf), 0.0, 1.0);
  vec3 base = mix(uShallow, uTeal, smoothstep(0.0, 0.24, t));
  base = mix(base, uPetrol, smoothstep(0.20, 0.55, t));
  base = mix(base, uAbyss, smoothstep(0.48, 1.0, t));
  // Geniş yapı TOPLANARAK biner, çarpılarak değil. Koyu bir tabanda çarpım
  // hiçbir şey yapmaz: 0.03 tabanın %20'si 0.006, yani algı eşiğinin çok
  // altı. Canvas2D geçişinde aynı hataya düşülmüştü; burada da aynı ders.
  base += broad * vec3(0.014, 0.024, 0.028);

  // --- HAREKETLİ NORMALLER ---
  // İki frekans, ayrı ölçek/yön/hız. Tek doku kaydırmak "kayan fotoğraf"
  // okunur; iki farklı hızda katman ise ışığın SUYUN ÜZERİNDE gezdiği
  // izlenimini verir.
  vec4 w1 = wave(world, 620.0, vec2(6.0, -3.6), 0.0);
  vec4 w2 = wave(world, 190.0, vec2(-9.5, 5.2), 1.05);
  vec2 n1 = (w1.rg - 0.5) * 2.0;
  vec2 n2 = (w2.rg - 0.5) * 2.0;
  // İnce kırışıklık yalnız yakında: uzakta piksel altına iner, moiré üretir.
  vec2 nxy = n1 * 0.75 + n2 * (0.30 + 0.55 * uDetail);
  // Sığlıkta dalga sönümlenir; dip sürtünmesinin ucuz taklidi.
  nxy *= mix(0.55, 1.0, smoothstep(0.0, 0.35, t));
  // Eğim payı 0.55 -> 1.35. Ölçüldü: 0.55'te normalin sapması o kadar küçük
  // kalıyordu ki Fresnel (1-dot)^3 ≈ 0.014, yani su 24 saniyede 1/255
  // değişiyordu — hareket eden ışık YOKTU. Dalgalar görünsün diye eğim gerçek
  // olmalı; yüzey yine de düz kalır, çünkü N.z baskın.
  vec3 N = normalize(vec3(nxy * 1.35, 1.0));

  // --- FRESNEL (taklit) ---
  // Tepeden bakılan bir haritada gerçek bakış açısı yok; sanal olarak hafif
  // eğik bir bakış varsayılır. Dalga eğimi arttıkça yüzey daha yansıtıcı
  // olur — "ıslak" izlenimini veren şey budur. Ayna yansıması YOK.
  vec3 V = normalize(vec3(0.16, 0.30, 1.0));
  float fres = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 2.0);
  // Yansıma tonu SOĞUK ve koyu: gökyüzü değil, kurşuni bir gün ışığı. Ayna
  // yansıması yok, yalnız ıslaklık izlenimi.
  vec3 skyTone = vec3(0.176, 0.235, 0.267);
  vec3 col3 = mix(base, skyTone, clamp(fres * uFresAmp, 0.0, 0.60));

  // --- YÖNLÜ SPEKÜLAR ---
  // Tek küresel ışık. Üs düşük tutulur: geniş ve yumuşak vurgu, kıvılcım
  // değil. Parıldayan okyanus istenmiyor.
  vec3 Ldir = normalize(vec3(-0.55, -0.68, 0.48));
  vec3 H = normalize(Ldir + V);
  // ÜS YÜKSEK OLMALI. Tepeden bakılan bir haritada hem ışık hem bakış dikeye
  // yakındır, dolayısıyla H de dikeydir: DÜZ su bile dot(N,H)≈0.93 verir.
  // Üs 22'de bu 0.93^22 = 0.20 demekti, yani okyanusun TAMAMI aydınlanıyor ve
  // geniş soluk lekeler oluşuyordu (ilk denemede görülen hata). 80'de düz su
  // 0.003'e iner; vurgu yalnız dalganın gerçekten ışığa döndüğü yerde çıkar.
  float spec = pow(max(dot(N, H), 0.0), 60.0);
  // Seyreklik: yalnız geniş ölçekli alanın aydınlık kuşaklarında görünür.
  spec *= 0.35 + 0.65 * smoothstep(-0.25, 0.55, broad);
  col3 += vec3(0.50, 0.56, 0.57) * spec * uSpecAmp * (0.45 + 0.55 * uDetail);

  // --- KIYI ---
  // LAND → dar koyu temas kenarı → KIRIK soluk köpük → sığ teal → derin su.
  // Köpük sürekli DEĞİL: eşik gürültüyle kırılır, genişliği yer yer sıfıra
  // iner. Turkuaz hale yok.
  float edge = 1.0 - smoothstep(0.0, uHexSize * 0.42, dist);
  col3 *= 1.0 - edge * 0.42;

  // Köpük bandı: kıyıdan ~1.6 hex içeri. Kırılma TOPLAMLA yapılır, çarpımla
  // değil — iki gürültünün çarpımı ortalama 0.25'e çöküyor ve eşik neredeyse
  // hiç aşılmıyordu (ilk denemede köpük görünmüyordu).
  float band = (1.0 - smoothstep(uHexSize * 0.22, uHexSize * 1.05, dist))
             * smoothstep(0.0, uHexSize * 0.16, dist);
  float chop = wave(world, 190.0, vec2(3.4, -2.0), 2.1).b * 0.6
             + wave(world, 58.0, vec2(5.5, -3.0), 0.7).a * 0.4;
  // Eşik gürültünün KENDİSİYLE oynatılır: köpüğün genişliği kıyı boyunca
  // değişir, yer yer tamamen kesilir. Sürekli bir şerit istenmiyor.
  //
  // Eşik YÜKSEK tutulur. 0.40'ta chop degerinin (ortalama ~0.5) yarisi geciyor
  // ve köpük bandın tamamını dolduruyordu: kıyıyı saran kesintisiz soluk bir
  // hale — briefin açıkça yasakladığı şey. 0.60'ta yalnız üst kuyruk geçer.
  float gate = 0.52 + 0.19 * (wave(world, 940.0, vec2(0.8, -0.5), 1.4).b - 0.5) * 2.0;
  float foam = band * smoothstep(gate, gate + 0.11, chop);
  foam *= 0.6 + 0.4 * uDetail;
  col3 = mix(col3, vec3(0.58, 0.64, 0.63), clamp(foam * uFoamAmp, 0.0, 0.62));

  fragColor = vec4(col3, 1.0);
}`;

function compile(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error('shader: ' + log);
  }
  return sh;
}

/**
 * Döşenebilir dalga dokusu: RG normalin xy'si, B ve A iki bağımsız yükseklik
 * alanı. Normal CPU'da sonlu farkla çıkarılır — shader'da her karede türev
 * almaktan çok daha ucuz ve doku zaten döşenebilir.
 */
function buildWaveTexture() {
  const size = WAVE_SIZE;
  const h = fbm(size, size, [4, 8, 16, 32], makeRng(20260903));
  const h2 = fbm(size, size, [3, 7, 15], makeRng(77120451));
  const data = new Uint8Array(size * size * 4);
  const at = (x, y) => h[(((y % size) + size) % size) * size + (((x % size) + size) % size)];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const gx = (at(x + 1, y) - at(x - 1, y)) * 0.5;
      const gy = (at(x, y + 1) - at(x, y - 1)) * 0.5;
      const p = i * 4;
      data[p] = Math.round(Math.max(0, Math.min(1, 0.5 - gx * 6)) * 255);
      data[p + 1] = Math.round(Math.max(0, Math.min(1, 0.5 - gy * 6)) * 255);
      data[p + 2] = Math.round(h[i] * 255);
      data[p + 3] = Math.round(h2[i] * 255);
    }
  }
  return { data, size };
}

export class WaterGL {
  /** WebGL2 yoksa null döner: çağıran Canvas2D suyuna geri düşer. */
  static create(canvas) {
    const gl = canvas.getContext('webgl2', {
      alpha: true, antialias: false, depth: false, stencil: false,
      premultipliedAlpha: true, powerPreference: 'high-performance',
    });
    if (!gl) return null;
    try {
      return new WaterGL(canvas, gl);
    } catch {
      return null;
    }
  }

  constructor(canvas, gl) {
    this.canvas = canvas;
    this.gl = gl;
    this.world = null;
    this.dpr = 1;
    /**
     * Su ÇÖZÜNÜRLÜĞÜ tam kare değil: malzeme düşük frekanslı olduğu için
     * 0.75x'te fark görünmez, piksel işi %44 azalır.
     */
    this.resScale = 0.75;
    this.lastDraw = 0;
    this.debug = { enabled: true };
    /**
     * Denizin karakteri. Konsoldan canlı değiştirilebilir:
     *   game.renderer.waterGL.tune.abyss = [0.05, 0.12, 0.15]
     *   game.renderer.waterGL.draw(game.camera, performance.now()/1000, true)
     */
    // Varsayılan: referans #3 ve #4'ün ORTAK belirleyici özelliği — kıyıya
    // oturan aydınlık turkuaz şelf + koyu açık deniz. Aradaki fark derecedir:
    // #4 abisi neredeyse siyaha, #3 daha aydınlık bir tealde tutar. Bu ayar
    // ikisinin arasındadır; abis siyaha çakılmadığı için uzak zoomda açık
    // denizde de yapı okunur.
    this.tune = {
      shallow: [0.185, 0.420, 0.412],
      teal: [0.085, 0.225, 0.245],
      petrol: [0.042, 0.112, 0.138],
      abyss: [0.025, 0.066, 0.086],
      shelf: 0.95,
      spec: 1.00,
      fresnel: 2.20,
      foam: 0.66,
    };

    const prog = gl.createProgram();
    gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error('program: ' + gl.getProgramInfoLog(prog));
    }
    this.prog = prog;
    this.vao = gl.createVertexArray();
    this.u = {};
    for (const name of ['uViewport', 'uDpr', 'uCam', 'uZoom', 'uTime', 'uWrap',
      'uGrid', 'uHexSize', 'uFieldOrigin', 'uFieldSpan', 'uDistMax', 'uDetail',
      'uHex', 'uDist', 'uWave',
      'uShallow', 'uTeal', 'uPetrol', 'uAbyss', 'uShelf',
      'uSpecAmp', 'uFresAmp', 'uFoamAmp']) {
      this.u[name] = gl.getUniformLocation(prog, name);
    }

    const wave = buildWaveTexture();
    this.waveTex = this.makeTex(gl.RGBA8, gl.RGBA, wave.size, wave.size, wave.data,
      gl.LINEAR, gl.REPEAT);
    this.hexTex = null;
    this.distTex = null;
  }

  makeTex(internal, format, w, h, data, filter, wrap, wrapT = wrap) {
    const gl = this.gl;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, format, gl.UNSIGNED_BYTE, data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrapT);
    return tex;
  }

  /**
   * Dünya verisi: hex başına su bayrağı (tam maske) ve kıyı uzaklığı alanı.
   *
   * Uzaklık alanı LandMaterial'ın zaten hesapladığı chamfer dönüşümünden
   * gelir (bkz. material.js) — aynı işi iki kez yapmanın anlamı yok ve iki
   * katmanın kıyısı böylece bit bit aynı yerde.
   */
  setWorld(world, coast) {
    if (this.world === world && this.hexTex && this.distTex) return true;
    if (!coast?.toLand) return false;
    const gl = this.gl;
    const cols = world.cols;
    const rows = world.rows;

    const hex = new Uint8Array(cols * rows);
    for (let i = 0; i < hex.length; i++) {
      const t = world.tiles[i];
      hex[i] = t && t.terrain.water ? 255 : 0;
    }
    if (this.hexTex) gl.deleteTexture(this.hexTex);
    this.hexTex = this.makeTex(gl.R8, gl.RED, cols, rows, hex,
      gl.NEAREST, gl.REPEAT, gl.CLAMP_TO_EDGE);

    const { toLand, w, h } = coast;
    const dist = new Uint8Array(w * h);
    for (let i = 0; i < dist.length; i++) {
      dist[i] = Math.min(255, Math.round((toLand[i] / DIST_MAX) * 255));
    }
    if (this.distTex) gl.deleteTexture(this.distTex);
    this.distTex = this.makeTex(gl.R8, gl.RED, w, h, dist,
      gl.LINEAR, gl.REPEAT, gl.CLAMP_TO_EDGE);

    this.world = world;
    this.grid = { cols, rows };
    this.field = {
      x0: WRAP_X0, y0: -ROW_H / 2,
      spanX: cols * HEX_STEP, spanY: rows * ROW_H,
    };
    return true;
  }

  resize(cssW, cssH, dpr) {
    const w = Math.max(1, Math.round(cssW * dpr * this.resScale));
    const h = Math.max(1, Math.round(cssH * dpr * this.resScale));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.cssW = cssW;
    this.cssH = cssH;
    this.dpr = dpr * this.resScale;
  }

  /** Kamera/zaman değişmediyse çizmeye gerek yok. */
  draw(camera, time, force = false) {
    if (!this.world || !this.debug.enabled) return false;
    const now = performance.now();
    const moved = this.lastCam?.x !== camera.x || this.lastCam?.y !== camera.y
      || this.lastCam?.zoom !== camera.zoom;
    if (!force && !moved && now - this.lastDraw < FRAME_MS) return false;
    this.lastDraw = now;
    this.lastCam = { x: camera.x, y: camera.y, zoom: camera.zoom };

    const gl = this.gl;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.prog);
    gl.bindVertexArray(this.vao);

    const u = this.u;
    gl.uniform2f(u.uViewport, this.cssW, this.cssH);
    gl.uniform1f(u.uDpr, this.dpr);
    gl.uniform2f(u.uCam, camera.x, camera.y);
    gl.uniform1f(u.uZoom, camera.zoom);
    gl.uniform1f(u.uTime, time);
    gl.uniform1f(u.uWrap, this.world.wrapWidth || 0);
    gl.uniform2f(u.uGrid, this.grid.cols, this.grid.rows);
    gl.uniform1f(u.uHexSize, HEX_SIZE);
    gl.uniform2f(u.uFieldOrigin, this.field.x0, this.field.y0);
    gl.uniform2f(u.uFieldSpan, this.field.spanX, this.field.spanY);
    gl.uniform1f(u.uDistMax, DIST_MAX);
    // LOD: yakınlaştıkça ince kırışıklık ve spekülar payı açılır.
    gl.uniform1f(u.uDetail, Math.max(0, Math.min(1, (camera.zoom - 0.35) / 1.1)));
    const T = this.tune;
    gl.uniform3fv(u.uShallow, T.shallow);
    gl.uniform3fv(u.uTeal, T.teal);
    gl.uniform3fv(u.uPetrol, T.petrol);
    gl.uniform3fv(u.uAbyss, T.abyss);
    gl.uniform1f(u.uShelf, T.shelf);
    gl.uniform1f(u.uSpecAmp, T.spec);
    gl.uniform1f(u.uFresAmp, T.fresnel);
    gl.uniform1f(u.uFoamAmp, T.foam);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.hexTex);
    gl.uniform1i(u.uHex, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.distTex);
    gl.uniform1i(u.uDist, 1);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.waveTex);
    gl.uniform1i(u.uWave, 2);

    gl.drawArrays(gl.TRIANGLES, 0, 3);
    return true;
  }
}
