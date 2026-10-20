// Kompozitör kamerası. Görüntü uzayı her zaman 1920x1080 (oyunun CSS
// pikselleri); 2x fotoğraflar da bu uzaya yarım ölçekle çizilir, böylece
// meta.json'daki getBoundingClientRect dikdörtgenleri doğrudan kullanılır.
//
// Anahtar kare: { t, cx, cy, z, ease } — t mutlak fragman saniyesi.
// z=1 tam kare; z=2 iki kat yakın. Eğri, bir ÖNCEKİ kareden bu kareye giden
// geçişe uygulanır.
import { clamp, inOutCubic } from './easing.js';

export const W = 1920, H = 1080;

export function sample(keys, t) {
  if (!keys?.length) return { cx: W / 2, cy: H / 2, z: 1, rot: 0 };
  if (t <= keys[0].t) return norm(keys[0]);
  for (let i = 1; i < keys.length; i++) {
    const a = keys[i - 1], b = keys[i];
    if (t <= b.t) {
      const k = (b.ease ?? inOutCubic)(clamp((t - a.t) / (b.t - a.t)));
      // Zoom logaritmik enterpole edilir: algılanan hız sabit kalsın.
      const z = Math.exp(Math.log(a.z ?? 1) + (Math.log(b.z ?? 1) - Math.log(a.z ?? 1)) * k);
      return {
        cx: (a.cx ?? W / 2) + ((b.cx ?? W / 2) - (a.cx ?? W / 2)) * k,
        cy: (a.cy ?? H / 2) + ((b.cy ?? H / 2) - (a.cy ?? H / 2)) * k,
        z, rot: (a.rot ?? 0) + ((b.rot ?? 0) - (a.rot ?? 0)) * k,
        speed: Math.abs(k - (b.ease ?? inOutCubic)(clamp((t - 1 / 60 - a.t) / (b.t - a.t)))),
      };
    }
  }
  return norm(keys[keys.length - 1]);
}
const norm = (k) => ({ cx: k.cx ?? W / 2, cy: k.cy ?? H / 2, z: k.z ?? 1, rot: k.rot ?? 0, speed: 0 });

// Bir dikdörtgeni ekranda belirli bir paya oturtan kamera.
export function frameRect(r, fill = 0.6, bias = [0, 0]) {
  const z = Math.min((W * fill) / r.w, (H * fill) / r.h);
  return { cx: r.x + r.w / 2 + bias[0] / z, cy: r.y + r.h / 2 + bias[1] / z, z: Math.max(1, z) };
}

// Kamerayı kare dışına taşmayacak biçimde sınırlar (kenar boşluğu göstermesin).
export function contain(v) {
  const z = Math.max(1, v.z);
  const hw = W / 2 / z, hh = H / 2 / z;
  return { ...v, z, cx: clamp(v.cx, hw, W - hw), cy: clamp(v.cy, hh, H - hh) };
}

export function apply(ctx, v, shake = [0, 0, 0]) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.translate(W / 2 + shake[0], H / 2 + shake[1]);
  if (v.rot || shake[2]) ctx.rotate((v.rot ?? 0) + shake[2]);
  ctx.scale(v.z, v.z);
  ctx.translate(-v.cx, -v.cy);
}

// Görüntü uzayındaki bir noktanın ekrandaki yeri (kaplamalar için).
export function project(v, x, y) {
  return [W / 2 + (x - v.cx) * v.z, H / 2 + (y - v.cy) * v.z];
}
