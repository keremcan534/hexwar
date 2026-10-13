// EĞİK KAMERA — 3B önizleme stilinin (gfx/threeD.js) bütün geometrisi.
//
// Neden ayrı ve DOM'suz: aynı görünüm üç ayrı çizere gider — SurfaceGL'in
// arazi mesh'i, mürekkep örtüsü (ayrı WebGL bağlamı) ve laboratuvarın three.js
// denizi. Üçü aynı matrisi kullanmazsa kıyı, sınır ve dalga bir pikselde bile
// kayar; tek kaynak bu dosya. Node'da test edilebilir (tıklama ışını dahil).
//
// Eksenler OYUNUN dünyasıdır: x doğu, y GÜNEY (Canvas2D geleneği), z yukarı.
// Kamera hedefin güneyinde durur ve kuzeye bakar: ekranın üstü kuzey kalır,
// ülke adları düz okunur. Eğim 0 dikey bakıştır (bu stil orada klasik yolu
// çizer, mesh hiç kurulmaz).
//
// "zoom" sözleşmesi korunur: hedef noktasında 1 dünya birimi = zoom CSS
// pikseli (yatayda). Böylece aynı kadraj iki kipte aynı ölçekte durur ve
// kamera kilidi, zoom sınırları, LOD eşikleri değişmeden çalışır.

import { SQRT3 } from '../../core/hex.js';
import { HEX_SIZE } from '../../world/worldgen.js';
import { TERRAIN_SUB } from '../terrainBake.js';

const HEX_STEP = SQRT3 * HEX_SIZE;
/** Yükseklik tekselinin dünya eni (mesh adımının birimi). */
export const TERRAIN_TEXEL = HEX_STEP / TERRAIN_SUB;
/** Izgara başına azami hücre (eksen başına): uzak zoomda adım büyür. */
const GRID_MAX = 720;
/** Merkezde iki vertex arası hedef ekran aralığı (CSS piksel). */
const GRID_PX = 6;

const DEG = Math.PI / 180;

/**
 * Görünüm. Girdi oyunun kamerası (x, y, zoom, viewWidth, viewHeight) ve
 * stil ayarları; çıktı matrisler, göz, görünür zemin kutusu ve mesh ızgarası.
 *
 * @param {object} cam   oyun kamerası (yalnız okunur)
 * @param {object} o     { tilt (derece), fov (derece), heightScale (dünya
 *                         birimi / yükseklik birimi), heightCurve (ova
 *                         basıklığı, bkz. MESH_VERT_BODY), hMax (yükseklik birimi) }
 */
export function makeView3D(cam, o) {
  const W = cam.viewWidth;
  const H = cam.viewHeight;
  const tilt = Math.max(0, Math.min(62, o.tilt)) * DEG;
  const fov = Math.max(10, Math.min(70, o.fov)) * DEG;
  const st = Math.sin(tilt);
  const ct = Math.cos(tilt);
  // CSS piksel cinsinden odak: dikey görüş açısından.
  const f = (H / 2) / Math.tan(fov / 2);
  const D = f / cam.zoom;
  const T = [cam.x, cam.y, o.zTarget ?? 0];
  const E = [T[0], T[1] + D * st, T[2] + D * ct];
  const R = [1, 0, 0];
  const U = [0, -ct, st];
  const F = [0, -st, -ct];

  const near = Math.max(1, D * 0.05);
  const far = D * 8 + (o.heightScale ?? 0) * 4;
  const view = new Float32Array(16);
  // Sütun-öncelikli (WebGL): göz uzayı x=R, y=U, z=−F.
  view[0] = R[0]; view[4] = R[1]; view[8] = R[2]; view[12] = -dot(R, E);
  view[1] = U[0]; view[5] = U[1]; view[9] = U[2]; view[13] = -dot(U, E);
  view[2] = -F[0]; view[6] = -F[1]; view[10] = -F[2]; view[14] = dot(F, E);
  view[15] = 1;
  const proj = perspective(fov, W / H, near, far);
  const viewProj = mul4(proj, view);

  /** Ekran pikselinden (CSS) dünyaya giden ışının yönü (normalize değil). */
  const rayDir = (sx, sy) => {
    const a = (sx - W / 2) / f;
    const b = (H / 2 - sy) / f;
    return [F[0] + R[0] * a + U[0] * b, F[1] + R[1] * a + U[1] * b, F[2] + R[2] * a + U[2] * b];
  };

  // GÖRÜNÜR ZEMİN. Dört köşe ışını iki düzlemle kesilir: deniz seviyesi ve
  // en yüksek zirve. Alt kenarın dışındaki bir dağ zirvesiyle görüşe girebilir
  // (ışın tepede daha yakına düşer); üst kenarın ötesi hiçbir yükseklikte
  // görünmez. İkisinin birleşimi mesh'in, mürekkep tuvalinin ve deniz
  // yamasının ortak kapsamıdır.
  const curve = o.heightCurve ?? 0;
  const hm = o.hMax ?? 1;
  const hTop = hm * (1 - curve + curve * hm) * (o.heightScale ?? 0);
  const pts = [];
  for (const [sx, sy] of [[0, 0], [W, 0], [0, H], [W, H]]) {
    const d = rayDir(sx, sy);
    for (const z of [0, hTop]) {
      let t;
      if (d[2] < -1e-4) t = (z - E[2]) / d[2];
      else t = far * 0.9;       // ufkun üstü: kırpma uzaklığına kadar
      t = Math.min(t, far * 0.9);
      if (t <= 0) continue;
      pts.push([E[0] + d[0] * t, E[1] + d[1] * t]);
    }
  }
  const bbox = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
  for (const [x, y] of pts) {
    bbox.minX = Math.min(bbox.minX, x);
    bbox.maxX = Math.max(bbox.maxX, x);
    bbox.minY = Math.min(bbox.minY, y);
    bbox.maxY = Math.max(bbox.maxY, y);
  }

  // MESH IZGARASI. Adım yükseklik tekselinin 2^L katı: merkezde ~6 piksel.
  // Dünyaya ÇİVİLİ (adımın katlarına yuvarlanır): kamera kayınca vertexler
  // yerinde kalır, siluet "yüzmez".
  let L = Math.round(Math.log2(GRID_PX / (cam.zoom * TERRAIN_TEXEL)));
  L = Math.max(-1, Math.min(5, L));
  let step = TERRAIN_TEXEL * 2 ** L;
  const margin = step * 2;
  let x0;
  let y0;
  let cols;
  let rows;
  for (;;) {
    x0 = Math.floor((bbox.minX - margin) / step) * step;
    y0 = Math.floor((bbox.minY - margin) / step) * step;
    cols = Math.ceil((bbox.maxX + margin - x0) / step);
    rows = Math.ceil((bbox.maxY + margin - y0) / step);
    if ((cols <= GRID_MAX && rows <= GRID_MAX) || L >= 6) break;
    L++;
    step *= 2;
  }
  const grid = { x0, y0, step, cols, rows, lod: Math.max(0, L) };

  return {
    tilt: tilt / DEG, fov: fov / DEG, W, H, f, D, zoom: cam.zoom,
    eye: E, target: T, right: R, up: U, fwd: F,
    near, far, view, proj, viewProj, bbox, grid,
    heightScale: o.heightScale ?? 0,
    heightCurve: curve,
    rayDir,
    /** Dünya noktası → CSS ekran pikseli (+ derinlik); kamera arkasındaysa null. */
    project(x, y, z = 0) {
      const p = [x - E[0], y - E[1], z - E[2]];
      const depth = dot(F, p);
      if (depth <= near) return null;
      return {
        x: W / 2 + (dot(R, p) / depth) * f,
        y: H / 2 - (dot(U, p) / depth) * f,
        depth,
      };
    },
    /**
     * Ekran pikseli → zeminde dünya noktası (ışın izi). heightAt(x, y) dünya
     * biriminde zemin yüksekliği (deniz 0). Önce kaba adım, sonra ikiye bölme:
     * dağın arkasındaki zemin değil, gözün GÖRDÜĞÜ ilk yüzey döner.
     */
    pick(sx, sy, heightAt) {
      const d = rayDir(sx, sy);
      const len = Math.hypot(d[0], d[1], d[2]);
      const dir = [d[0] / len, d[1] / len, d[2] / len];
      if (dir[2] >= -1e-4) return null;
      // Deniz düzlemine kadar olan aralık; adım yükseklik tekselinin yarısı.
      const tEnd = -E[2] / dir[2];
      const tStart = Math.max(near, (hTop - E[2]) / dir[2]);
      const dt = Math.max(TERRAIN_TEXEL * 0.5, (tEnd - tStart) / 600);
      let prev = tStart;
      const above = (t) => E[2] + dir[2] * t - heightAt(E[0] + dir[0] * t, E[1] + dir[1] * t);
      if (above(tStart) <= 0) return { x: E[0] + dir[0] * tStart, y: E[1] + dir[1] * tStart };
      for (let t = tStart + dt; t <= tEnd + dt; t += dt) {
        if (above(t) <= 0) {
          let a = prev;
          let b = t;
          for (let i = 0; i < 12; i++) {
            const m = (a + b) / 2;
            if (above(m) > 0) a = m;
            else b = m;
          }
          return { x: E[0] + dir[0] * b, y: E[1] + dir[1] * b };
        }
        prev = t;
      }
      return { x: E[0] + dir[0] * tEnd, y: E[1] + dir[1] * tEnd };
    },
  };
}

function dot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

/** OpenGL perspektifi (three.js makePerspective ile aynı biçim). */
export function perspective(fovY, aspect, near, far) {
  const t = 1 / Math.tan(fovY / 2);
  const m = new Float32Array(16);
  m[0] = t / aspect;
  m[5] = t;
  m[10] = (far + near) / (near - far);
  m[11] = -1;
  m[14] = (2 * far * near) / (near - far);
  return m;
}

/** Sütun-öncelikli 4x4 çarpım: a·b. */
export function mul4(a, b) {
  const m = new Float32Array(16);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
      m[c * 4 + r] = s;
    }
  }
  return m;
}
