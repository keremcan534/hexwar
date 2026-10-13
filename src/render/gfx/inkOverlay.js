// MÜREKKEP ÖRTÜSÜ — eğik kamerada Canvas2D mürekkebini araziye giydirir.
//
// Sınır, nehir, etiket, şehir, birim: hepsi oyunun kendi Canvas2D çizimidir
// ve Canvas2D yalnız afin dönüşüm bilir, perspektif bilmez. Eğik kamerada
// renderer bu mürekkebi ekran DIŞI bir tuvale, görünür zemini kaplayan
// genişletilmiş bir tepeden bakışla çizer (gfx/threeD.js); bu sınıf o tuvali
// doku olarak alır ve arazi mesh'inin AYNISINA (aynı ızgara, aynı yükseklik,
// aynı matris) yapıştırır. Dağın arkasında kalan mürekkep derinlik testiyle
// örtülür, sırtın üstünden geçen sınır sırtı izler.
//
// NEDEN AYRI BAĞLAM: katman sırası. three.js denizi (#map-kirilma) #map-water'ın
// ÜSTÜNDE durur ve onu kırarak örnekler; mürekkep SurfaceGL'e çizilseydi
// denizdeki etiket, filo ve deniz yolu suyun altında, kırılmış ve soğurulmuş
// kalırdı. Bu tuval #map ile aynı katmanda (z 1), denizin üstündedir.
//
// Aynı geçişte HAVA PERSPEKTİFİ: uzak zemin göze olan uzaklıkla açık bir pusa
// karışır (yalnız açar, asla karartmaz). Örtü en üstteki harita tuvali olduğu
// için pus kara, deniz ve mürekkebe birlikte, tek kez biner.
//
// Katman notu: DOM ve GPU'ya dokunur, oyun durumuna dokunmaz.

import { MESH_VERT_BODY } from '../surfaceGL.js';

const VERT = `#version 300 es
precision highp float;
precision highp int;
${MESH_VERT_BODY}`;

const FRAG = `#version 300 es
precision highp float;
in vec3 vWorld;
out vec4 fragColor;
uniform sampler2D uInk;      // mürekkep tuvali, önçarpımlı
uniform vec4 uInkRect;       // tuvalin dünya dikdörtgeni: x0, y0, en, boy
uniform vec3 uEye;
uniform float uHazeNear;     // pusun başladığı göz uzaklığı (dünya birimi)
uniform float uHazeFar;      // tam pus uzaklığı
uniform float uHazeAmt;      // en uzakta pus payı (0 kapatır)
uniform vec3 uHazeCol;
uniform vec2 uWorldY;        // dünyanın kuzey/güney kenarı (dünya y)
uniform float uEdgeFog;      // kenarın ötesindeki sisin azami payı
uniform float uEdgeReach;    // sisin tamamlandığı uzaklık (dünya birimi)
uniform vec3 uEdgeCol;
void main() {
  vec2 uv = (vWorld.xy - uInkRect.xy) / uInkRect.zw;
  vec4 ink = vec4(0.0);
  if (uv.x >= 0.0 && uv.x <= 1.0 && uv.y >= 0.0 && uv.y <= 1.0) ink = texture(uInk, uv);
  float d = length(uEye - vWorld);
  float f = uHazeAmt * smoothstep(uHazeNear, uHazeFar, d);
  // DÜNYANIN KENARI. Eğik bakış kutup kenarının ötesini görür; orada veri
  // yok. Boş deniz yerine sise karışır: harita kenarı "bulutta biter".
  float beyond = max(uWorldY.x - vWorld.y, vWorld.y - uWorldY.y);
  float fe = uEdgeFog * smoothstep(-uEdgeReach * 0.25, uEdgeReach, beyond);
  // İki örtü üst üste: önce pus, üstüne kenar sisi (önçarpımlı).
  vec3 fog = uHazeCol * f * (1.0 - fe) + uEdgeCol * fe;
  float fa = 1.0 - (1.0 - f) * (1.0 - fe);
  // Önçarpımlı "üstüne": pus mürekkebin de üstünde (uzak yazı da puslanır).
  vec3 rgb = fog + ink.rgb * (1.0 - fa);
  float a = fa + ink.a * (1.0 - fa);
  fragColor = vec4(rgb, a);
}`;

function compile(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    throw new Error(`inkOverlay shader: ${gl.getShaderInfoLog(sh)}`);
  }
  return sh;
}

export class InkOverlay3D {
  /** Tuvali #map'in hemen ardına kurar; WebGL2 yoksa null. */
  static create(after) {
    const canvas = document.createElement('canvas');
    canvas.id = 'map-3d-ink';
    canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;display:block;'
      + 'z-index:1;pointer-events:none;';
    const gl = canvas.getContext('webgl2', {
      alpha: true, premultipliedAlpha: true, antialias: true, depth: true, stencil: false,
      powerPreference: 'high-performance',
    });
    if (!gl) return null;
    after.after(canvas);
    try {
      return new InkOverlay3D(canvas, gl);
    } catch (err) {
      console.error('[gfx 3d] mürekkep örtüsü kurulamadı:', err.message);
      canvas.remove();
      return null;
    }
  }

  constructor(canvas, gl) {
    this.canvas = canvas;
    this.gl = gl;
    const prog = gl.createProgram();
    gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error(`inkOverlay link: ${gl.getProgramInfoLog(prog)}`);
    }
    this.prog = prog;
    this.u = {};
    for (const n of ['uTerrH', 'uFieldOrigin', 'uFieldSpan', 'uHeightScale', 'uHeightCurve', 'uViewProj',
      'uGridOrigin', 'uGridStep', 'uGridCols', 'uGridLod', 'uInk', 'uInkRect', 'uEye',
      'uHazeNear', 'uHazeFar', 'uHazeAmt', 'uHazeCol', 'uWorldY', 'uEdgeFog', 'uEdgeReach',
      'uEdgeCol']) {
      this.u[n] = gl.getUniformLocation(prog, n);
    }
    this.vao = gl.createVertexArray();
    this.inkTex = gl.createTexture();
    this.terrain = null;
    this.heightTex = null;
  }

  /**
   * Yükseklik: SurfaceGL ile AYNI kaynak, aynı yarım duyarlık. Yalnız R
   * kanalı gerekir; mipler SurfaceGL'deki gibi (sürücü ya da CPU kutusu) —
   * iki bağlamın mesh'i aynı tekseli okumazsa mürekkep kıyıdan kayar.
   */
  setTerrain(terrain) {
    if (terrain === this.terrain) return;
    const gl = this.gl;
    if (this.heightTex) gl.deleteTexture(this.heightTex);
    this.heightTex = null;
    this.terrain = terrain;
    if (!terrain) return;
    const H = terrain.height;
    const r = new Float32Array(H.w * H.h);
    for (let i = 0; i < r.length; i++) r[i] = H.data[i * 4];
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R16F, H.w, H.h, 0, gl.RED, gl.FLOAT, r);
    if (gl.getExtension('EXT_color_buffer_float')) {
      gl.generateMipmap(gl.TEXTURE_2D);
    } else {
      let cur = r;
      let w = H.w;
      let h = H.h;
      let level = 0;
      while (w > 1 || h > 1) {
        const nw = Math.max(1, w >> 1);
        const nh = Math.max(1, h >> 1);
        const dst = new Float32Array(nw * nh);
        for (let y = 0; y < nh; y++) {
          const y0 = Math.min(h - 1, y * 2);
          const y1 = Math.min(h - 1, y * 2 + 1);
          for (let x = 0; x < nw; x++) {
            const x0 = (x * 2) % w;
            const x1 = (x * 2 + 1) % w;
            dst[y * nw + x] = 0.25 * (cur[y0 * w + x0] + cur[y0 * w + x1] + cur[y1 * w + x0] + cur[y1 * w + x1]);
          }
        }
        gl.texImage2D(gl.TEXTURE_2D, ++level, gl.R16F, nw, nh, 0, gl.RED, gl.FLOAT, dst);
        cur = dst;
        w = nw;
        h = nh;
      }
    }
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.heightTex = tex;
  }

  resize(cssW, cssH, dpr) {
    const w = Math.max(1, Math.round(cssW * dpr));
    const h = Math.max(1, Math.round(cssH * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
  }

  /**
   * @param v      makeView3D çıktısı
   * @param ink    mürekkep tuvali (önçarpımsız Canvas2D; yüklemede çarpılır)
   * @param rect   tuvalin dünya dikdörtgeni {x0, y0, w, h}
   * @param haze   {near, far, amt, col[3]} (göz uzaklığı, dünya birimi)
   */
  draw(v, ink, rect, haze) {
    const gl = this.gl;
    if (!this.heightTex || !this.terrain) return false;
    const f = this.terrain.field;
    const T = (this.timings ??= { up: 0, mip: 0, draw: 0, n: 0 });
    let t = performance.now();
    // ÇİFT DOKU + yerinde yükleme: önceki karenin hâlâ okuduğu dokuyu yeniden
    // tanımlamak sürücüyü bekletiyordu (kaydırırken z0.6'da kare başına ~11 ms
    // ölçüldü). Sıradaki doku iki kare önce kullanılmıştır; boyut aynıysa
    // depolama korunur ve yalnız içerik yazılır.
    this.inkTexs ??= [this.inkTex, gl.createTexture()];
    this.inkSizes ??= [null, null];
    this.inkSlot = (this.inkSlot ?? 0) ^ 1;
    const slot = this.inkSlot;
    const tex = this.inkTexs[slot];
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    const sz = this.inkSizes[slot];
    if (sz && sz.w === ink.width && sz.h === ink.height) {
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, ink);
    } else {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, ink);
      this.inkSizes[slot] = { w: ink.width, h: ink.height };
    }
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    T.up += performance.now() - t;
    t = performance.now();
    // Uzak kenarda mürekkep küçülür: mipsiz ince çizgi ve yazı kırpışır.
    gl.generateMipmap(gl.TEXTURE_2D);
    T.mip += performance.now() - t;
    T.n++;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clearDepth(1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.useProgram(this.prog);
    gl.bindVertexArray(this.vao);
    const u = this.u;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.heightTex);
    gl.uniform1i(u.uTerrH, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.uniform1i(u.uInk, 1);
    gl.uniform2f(u.uFieldOrigin, f.x0, f.y0);
    gl.uniform2f(u.uFieldSpan, f.spanX, f.spanY);
    gl.uniform1f(u.uHeightScale, v.heightScale);
    gl.uniform1f(u.uHeightCurve, v.heightCurve ?? 0);
    gl.uniformMatrix4fv(u.uViewProj, false, v.viewProj);
    const G = v.grid;
    gl.uniform2f(u.uGridOrigin, G.x0, G.y0);
    gl.uniform1f(u.uGridStep, G.step);
    gl.uniform1i(u.uGridCols, G.cols);
    gl.uniform1f(u.uGridLod, G.lod);
    gl.uniform4f(u.uInkRect, rect.x0, rect.y0, rect.w, rect.h);
    gl.uniform3f(u.uEye, v.eye[0], v.eye[1], v.eye[2]);
    gl.uniform1f(u.uHazeNear, haze.near);
    gl.uniform1f(u.uHazeFar, haze.far);
    gl.uniform1f(u.uHazeAmt, haze.amt);
    gl.uniform3f(u.uHazeCol, haze.col[0], haze.col[1], haze.col[2]);
    gl.uniform2f(u.uWorldY, f.y0, f.y0 + f.spanY);
    gl.uniform1f(u.uEdgeFog, haze.edge ?? 0);
    gl.uniform1f(u.uEdgeReach, haze.edgeReach ?? 1);
    const ec = haze.edgeCol ?? haze.col;
    gl.uniform3f(u.uEdgeCol, ec[0], ec[1], ec[2]);
    gl.drawArrays(gl.TRIANGLES, 0, G.cols * G.rows * 6);
    gl.disable(gl.DEPTH_TEST);
    return true;
  }

  clear() {
    const gl = this.gl;
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  destroy() {
    this.canvas.remove();
    this.gl.getExtension('WEBGL_lose_context')?.loseContext();
  }
}
