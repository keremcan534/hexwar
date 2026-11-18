// Okyanusun ham WebGL2 takımı. three.js kullanılmıyor: tek kare içinde onlarca
// tam ekran geçişi (FFT) koşuluyor ve sahne grafiğinin kare başına yükü bu
// geçiş sayısında bütçenin kendisi olurdu.

/** Tam ekran üçgen: tepe tamponu yok, bağlanacak veri yok. */
export const FULL_VERT = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

function compile(gl, type, src, name) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS) && !gl.isContextLost()) {
    const log = gl.getShaderInfoLog(s);
    gl.deleteShader(s);
    throw new Error(`[okyanus] ${name} derlenmedi:\n${log}`);
  }
  return s;
}

export class GLKit {
  constructor(gl) {
    this.gl = gl;
    this.vao = gl.createVertexArray();
    this.programs = [];
    this.resources = new Set();
    gl.bindVertexArray(this.vao);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.disable(gl.BLEND);
    gl.disable(gl.DITHER);
    this.aniso = gl.getExtension('EXT_texture_filter_anisotropic');
    this.anisoMax = this.aniso ? gl.getParameter(this.aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT) : 1;
  }

  program(name, frag, vert = FULL_VERT) {
    const { gl } = this;
    const p = gl.createProgram();
    const vs = compile(gl, gl.VERTEX_SHADER, vert, `${name}.vert`);
    const fs = compile(gl, gl.FRAGMENT_SHADER, frag, `${name}.frag`);
    gl.attachShader(p, vs);
    gl.attachShader(p, fs);
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS) && !gl.isContextLost()) {
      throw new Error(`[okyanus] ${name} bağlanmadı:\n${gl.getProgramInfoLog(p)}`);
    }
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    const uniforms = new Map();
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) {
      const info = gl.getActiveUniform(p, i);
      const key = info.name.replace(/\[0\]$/, '');
      uniforms.set(key, { loc: gl.getUniformLocation(p, info.name), type: info.type, size: info.size });
    }
    const out = { name, handle: p, uniforms };
    this.programs.push(out);
    return out;
  }

  /** Doku oluşturur. `data` yoksa yalnız bellek ayrılır. */
  texture(w, h, internal, {
    format, type, data = null, filter = 'nearest', wrapX = 'clamp', wrapY = wrapX, mips = false, aniso = false,
  } = {}) {
    const { gl } = this;
    const info = FORMATS(gl)[internal];
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    const levels = mips ? Math.floor(Math.log2(Math.max(w, h))) + 1 : 1;
    gl.texStorage2D(gl.TEXTURE_2D, levels, info.internal, w, h);
    if (data) {
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, w, h, format ?? info.format, type ?? info.type, data);
    }
    const mag = filter === 'nearest' ? gl.NEAREST : gl.LINEAR;
    let min = mag;
    if (mips) min = filter === 'nearest' ? gl.NEAREST_MIPMAP_NEAREST : gl.LINEAR_MIPMAP_LINEAR;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, mag);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, min);
    const wrapOf = (v) => (v === 'repeat' ? gl.REPEAT : gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrapOf(wrapX));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrapOf(wrapY));
    if (aniso && this.aniso) {
      gl.texParameterf(gl.TEXTURE_2D, this.aniso.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(8, this.anisoMax));
    }
    if (mips && data) gl.generateMipmap(gl.TEXTURE_2D);
    this.resources.add({ kind: 'tex', handle: tex });
    return tex;
  }

  /** Bir ya da birden çok dokuya yazan çizim hedefi (MRT). */
  target(w, h, textures) {
    const { gl } = this;
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    const list = Array.isArray(textures) ? textures : [textures];
    const draw = [];
    list.forEach((tex, i) => {
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + i, gl.TEXTURE_2D, tex, 0);
      draw.push(gl.COLOR_ATTACHMENT0 + i);
    });
    gl.drawBuffers(draw);
    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    if (status !== gl.FRAMEBUFFER_COMPLETE && !gl.isContextLost()) {
      throw new Error(`[okyanus] çizim hedefi eksik: 0x${status.toString(16)}`);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.resources.add({ kind: 'fb', handle: fb });
    return { fb, w, h, textures: list };
  }

  /**
   * Tek geçiş. `tex` sampler adı → doku; `vals` uniform adı → değer. Programda
   * olmayan ad sessizce atlanır: derleyici kullanılmayan uniformu siler ve
   * kaliteler arasında aynı çağrı kullanılır.
   */
  run(program, target, vals = {}, tex = {}) {
    const { gl } = this;
    gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.fb : null);
    if (target) gl.viewport(0, 0, target.w, target.h);
    gl.useProgram(program.handle);
    this.bind(program, vals, tex);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  bind(program, vals, tex) {
    const { gl } = this;
    let unit = 0;
    for (const name in tex) {
      const u = program.uniforms.get(name);
      if (!u) continue;
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, tex[name]);
      gl.uniform1i(u.loc, unit);
      unit++;
    }
    for (const name in vals) {
      const u = program.uniforms.get(name);
      if (u) setUniform(gl, u, vals[name]);
    }
  }

  mips(tex) {
    const { gl } = this;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.generateMipmap(gl.TEXTURE_2D);
  }

  dispose() {
    const { gl } = this;
    for (const r of this.resources) {
      if (r.kind === 'tex') gl.deleteTexture(r.handle);
      else gl.deleteFramebuffer(r.handle);
    }
    for (const p of this.programs) gl.deleteProgram(p.handle);
    this.resources.clear();
    this.programs.length = 0;
    gl.deleteVertexArray(this.vao);
  }
}

function setUniform(gl, u, v) {
  switch (u.type) {
    case gl.FLOAT: if (u.size > 1) gl.uniform1fv(u.loc, v); else gl.uniform1f(u.loc, v); break;
    case gl.FLOAT_VEC2: gl.uniform2fv(u.loc, v); break;
    case gl.FLOAT_VEC3: gl.uniform3fv(u.loc, v); break;
    case gl.FLOAT_VEC4: gl.uniform4fv(u.loc, v); break;
    case gl.FLOAT_MAT4: gl.uniformMatrix4fv(u.loc, false, v); break;
    case gl.INT: case gl.BOOL: gl.uniform1i(u.loc, v); break;
    case gl.INT_VEC2: gl.uniform2iv(u.loc, v); break;
    default: throw new Error(`[okyanus] tanınmayan uniform türü ${u.type}`);
  }
}

function FORMATS(gl) {
  return {
    rgba32f: { internal: gl.RGBA32F, format: gl.RGBA, type: gl.FLOAT },
    rg32f: { internal: gl.RG32F, format: gl.RG, type: gl.FLOAT },
    rgba16f: { internal: gl.RGBA16F, format: gl.RGBA, type: gl.HALF_FLOAT },
    rg16f: { internal: gl.RG16F, format: gl.RG, type: gl.HALF_FLOAT },
    r16f: { internal: gl.R16F, format: gl.RED, type: gl.FLOAT },
    rgba8: { internal: gl.RGBA8, format: gl.RGBA, type: gl.UNSIGNED_BYTE },
    rg8: { internal: gl.RG8, format: gl.RG, type: gl.UNSIGNED_BYTE },
  };
}
