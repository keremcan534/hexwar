// Kompozisyon efektleri. Hepsi DURUMSUZ: aynı t için aynı görüntü (paralel
// render parçaları birbirini tutsun diye parçacıklar bile t'nin saf
// fonksiyonudur).
import { clamp, rng, outQuart, inOutSine, outExpo } from '../motion/easing.js';
import { W, H } from '../motion/camera.js';

const off = (w = W, h = H) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
export const scratch = [off(), off(), off()];

// ---------------------------------------------------------------- gren
const GRAIN = [];
export function initGrain() {
  for (let k = 0; k < 8; k++) {
    const c = off(960, 540), g = c.getContext('2d');
    const img = g.createImageData(960, 540), r = rng(77 + k);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = 128 + (r() + r() + r() - 1.5) * 120;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0); GRAIN.push(c);
  }
}
export function grain(ctx, frame, amount = 0.07) {
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'overlay'; ctx.globalAlpha = amount;
  ctx.drawImage(GRAIN[frame % GRAIN.length], 0, 0, W, H);
  ctx.restore();
}

// ---------------------------------------------------------------- duman dokusu
let SMOKE = null;
function valueNoise(seed, n) {
  const r = rng(seed), g = new Float32Array(n * n);
  for (let i = 0; i < g.length; i++) g[i] = r();
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const s = (t) => t * t * (3 - 2 * t);
    const at = (a, b) => g[((b % n + n) % n) * n + ((a % n + n) % n)];
    const v0 = at(xi, yi) + (at(xi + 1, yi) - at(xi, yi)) * s(xf);
    const v1 = at(xi, yi + 1) + (at(xi + 1, yi + 1) - at(xi, yi + 1)) * s(xf);
    return v0 + (v1 - v0) * s(yf);
  };
}
export function initSmoke() {
  const S = 512, c = off(S, S), g = c.getContext('2d'), img = g.createImageData(S, S);
  const n1 = valueNoise(3, 8), n2 = valueNoise(5, 16), n3 = valueNoise(9, 32), n4 = valueNoise(11, 64);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = x / S, v = y / S;
    let f = n1(u * 8, v * 8) * 0.5 + n2(u * 16, v * 16) * 0.25 + n3(u * 32, v * 32) * 0.15 + n4(u * 64, v * 64) * 0.1;
    f = clamp((f - 0.42) * 2.4);
    const i = (y * S + x) * 4;
    img.data[i] = 205; img.data[i + 1] = 200; img.data[i + 2] = 192; img.data[i + 3] = f * 255;
  }
  g.putImageData(img, 0, 0); SMOKE = c;
}
/** Kenarlardan sızan duman: haritanın kenarına yayılır, ortayı boş bırakır. */
export function smoke(ctx, t, { alpha = 0.18, speed = 18, edge = true } = {}) {
  // Ayrı tuvalde kurulur: kenar temizliği yalnız dumanı siler, alttaki görüntüyü değil.
  const s = scratch[0].getContext('2d');
  s.setTransform(1, 0, 0, 1, 0, 0); s.globalCompositeOperation = 'source-over'; s.globalAlpha = 1;
  s.clearRect(0, 0, W, H);
  const sc = 4.2;
  for (let layer = 0; layer < 2; layer++) {
    const ox = ((t * speed * (1 + layer * 0.6)) % (512 * sc));
    s.globalAlpha = layer ? 0.6 : 1;
    for (let k = -1; k < 2; k++) s.drawImage(SMOKE, -ox + k * 512 * sc, -200 - layer * 140, 512 * sc, 512 * sc);
  }
  if (edge) {
    // Orta bölgeyi temizle: duman çerçeveler, okunacak bilgiyi örtmez.
    s.globalCompositeOperation = 'destination-out'; s.globalAlpha = 1;
    const g = s.createRadialGradient(W / 2, H / 2, H * 0.15, W / 2, H / 2, H * 0.75);
    g.addColorStop(0, 'rgba(0,0,0,0.95)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    s.fillStyle = g; s.fillRect(0, 0, W, H);
    s.globalCompositeOperation = 'source-over';
  }
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = alpha;
  ctx.drawImage(scratch[0], 0, 0);
  ctx.restore();
}

// ---------------------------------------------------------------- vinyet / renk
export function vignette(ctx, amount = 0.55, inner = 0.45) {
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
  const g = ctx.createRadialGradient(W / 2, H / 2, H * inner, W / 2, H / 2, H * 1.05);
  g.addColorStop(0, 'rgba(4,6,10,0)'); g.addColorStop(1, `rgba(4,6,10,${amount})`);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

/**
 * Renk düzeltme: lacivert gölgeler, fildişi ışıklar, hafif doygunluk kısma.
 * Kaynak tuval -> hedef; ctx.filter GPU'da çalışır.
 */
export function grade(dst, src, { contrast = 1.08, saturate = 0.88, brightness = 1, tint = 'rgba(12,24,40,0.16)', warm = 0 } = {}) {
  dst.save(); dst.setTransform(1, 0, 0, 1, 0, 0);
  dst.filter = `contrast(${contrast}) saturate(${saturate}) brightness(${brightness})`;
  dst.drawImage(src, 0, 0);
  dst.filter = 'none';
  if (tint) { dst.globalCompositeOperation = 'soft-light'; dst.fillStyle = tint; dst.fillRect(0, 0, W, H); }
  if (warm) { dst.globalCompositeOperation = 'soft-light'; dst.fillStyle = `rgba(150,60,40,${warm})`; dst.fillRect(0, 0, W, H); }
  dst.restore();
}

export function flash(ctx, k, color = '255,240,215') {
  if (k <= 0) return;
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'screen'; ctx.fillStyle = `rgba(${color},${clamp(k)})`;
  ctx.fillRect(0, 0, W, H); ctx.restore();
}

export function black(ctx, k) {
  if (k <= 0) return;
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = `rgba(0,0,0,${clamp(k)})`; ctx.fillRect(0, 0, W, H); ctx.restore();
}

// ---------------------------------------------------------------- odak
const rr = (c, x, y, w, h, r) => { c.beginPath(); c.roundRect(x, y, w, h, r); };
/**
 * Odak maskesi: dikdörtgen dışı kararır (ve isteğe bağlı bulanır). rect ekran
 * uzayında. Bulanıklık için çağıran, kareyi `src` olarak verir.
 */
export function focus(ctx, src, rect, { dim = 0.72, blur = 0, feather = 28, radius = 6, pad = 10, k = 1 } = {}) {
  if (!rect || k <= 0) return;
  const x = rect.x - pad, y = rect.y - pad, w = rect.w + pad * 2, h = rect.h + pad * 2;
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (blur > 0 && src) {
    const s = scratch[2].getContext('2d');
    s.setTransform(1, 0, 0, 1, 0, 0); s.globalCompositeOperation = 'source-over'; s.globalAlpha = 1;
    s.clearRect(0, 0, W, H);
    s.filter = `blur(${blur * k}px)`; s.drawImage(src, 0, 0); s.filter = 'none';
    s.globalCompositeOperation = 'destination-out';
    s.filter = `blur(${feather}px)`; s.fillStyle = '#000'; rr(s, x, y, w, h, radius); s.fill(); s.filter = 'none';
    s.globalCompositeOperation = 'source-over';
    ctx.drawImage(scratch[2], 0, 0);
  }
  const m = scratch[1].getContext('2d');
  m.setTransform(1, 0, 0, 1, 0, 0); m.globalCompositeOperation = 'source-over'; m.clearRect(0, 0, W, H);
  m.fillStyle = `rgba(3,6,10,${dim * k})`; m.fillRect(0, 0, W, H);
  m.globalCompositeOperation = 'destination-out';
  m.filter = `blur(${feather}px)`; m.fillStyle = '#000'; rr(m, x, y, w, h, radius); m.fill(); m.filter = 'none';
  m.globalCompositeOperation = 'source-over';
  ctx.drawImage(scratch[1], 0, 0);
  ctx.restore();
}

/** İnce pirinç çerçeve köşeleri (odaklanan değerin etrafında). */
export function brackets(ctx, rect, k, { pad = 14, len = 22, color = '#d8b46a' } = {}) {
  if (!rect || k <= 0) return;
  const e = outExpo(clamp(k));
  const x0 = rect.x - pad - (1 - e) * 30, y0 = rect.y - pad - (1 - e) * 20, x1 = rect.x + rect.w + pad + (1 - e) * 30, y1 = rect.y + rect.h + pad + (1 - e) * 20;
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.globalAlpha = clamp(k * 1.5);
  ctx.shadowColor = 'rgba(236,209,151,0.6)'; ctx.shadowBlur = 8;
  ctx.beginPath();
  for (const [x, y, sx, sy] of [[x0, y0, 1, 1], [x1, y0, -1, 1], [x0, y1, 1, -1], [x1, y1, -1, -1]]) {
    ctx.moveTo(x + sx * len, y); ctx.lineTo(x, y); ctx.lineTo(x, y + sy * len);
  }
  ctx.stroke(); ctx.restore();
}

// ---------------------------------------------------------------- hareket bulanıklığı
const BLUR = off();
/**
 * Yönlü bulanıklık: kaynak, hareket doğrultusunda eşit aralıklı örneklerin
 * EŞİT ağırlıklı ortalaması olarak çizilir (1/(i+1) birikimi = gerçek kutu
 * bulanıklığı). Azalan ağırlıklı az örnek, yazıyı basamaklı kopyalara
 * bölüyordu. Hedefi tamamen örter; (ox, oy) kaynak kaydırması.
 */
export function directionalBlur(ctx, src, dx, dy, _taps, ox = 0, oy = 0) {
  const d = Math.hypot(dx, dy);
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  if (d < 1) { ctx.drawImage(src, ox, oy); ctx.restore(); return; }
  const n = Math.max(8, Math.min(64, Math.ceil(d / 3)));
  const a = BLUR.getContext('2d');
  a.setTransform(1, 0, 0, 1, 0, 0); a.globalCompositeOperation = 'source-over';
  a.globalAlpha = 1; a.fillStyle = '#05070a'; a.fillRect(0, 0, W, H);
  for (let i = 0; i < n; i++) {
    const f = i / (n - 1) - 0.5;
    a.globalAlpha = 1 / (i + 1);
    a.drawImage(src, ox + dx * f, oy + dy * f);
  }
  a.globalAlpha = 1;
  ctx.drawImage(BLUR, 0, 0);
  ctx.restore();
}

/** Kromatik ayrışma — yalnız darbe karelerinde, birkaç pikselle sınırlı. */
export function chroma(ctx, src, px) {
  if (px < 0.5) return;
  const s = scratch[2].getContext('2d');
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
  for (const [col, ox] of [['#ff0000', -px], ['#0000ff', px]]) {
    s.setTransform(1, 0, 0, 1, 0, 0); s.globalCompositeOperation = 'source-over'; s.globalAlpha = 1;
    s.drawImage(src, 0, 0);
    s.globalCompositeOperation = 'multiply'; s.fillStyle = col; s.fillRect(0, 0, W, H);
    s.globalCompositeOperation = 'source-over';
    ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.35;
    ctx.drawImage(scratch[2], ox, 0);
  }
  ctx.restore();
}

// ---------------------------------------------------------------- parçacıklar
/** Korlar: aşağıdan yükselen, titreşen sıcak noktalar. */
export function embers(ctx, t, { count = 70, seed = 1, alpha = 1, area = [0, 0, W, H], rise = 120, t0 = 0, intensity = 1 } = {}) {
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'lighter';
  const r = rng(seed);
  for (let i = 0; i < count; i++) {
    const life = 1.6 + r() * 2.4, phase = r() * life, x0 = area[0] + r() * area[2], drift = (r() - 0.5) * 90;
    const size = 1 + r() * 2.6, sp = rise * (0.6 + r() * 0.9);
    const local = ((t - t0) + phase) % life;
    if (t - t0 + phase < 0) continue;
    const p = local / life;
    const x = x0 + drift * p + Math.sin((t + i) * (1.5 + r())) * 10;
    const y = area[1] + area[3] - sp * local;
    const a = Math.sin(Math.PI * p) * alpha * intensity * (0.6 + 0.4 * Math.sin(t * 13 + i));
    if (a <= 0) continue;
    const g = ctx.createRadialGradient(x, y, 0, x, y, size * 5);
    g.addColorStop(0, `rgba(255,214,150,${a})`); g.addColorStop(0.3, `rgba(255,120,40,${a * 0.6})`); g.addColorStop(1, 'rgba(255,60,10,0)');
    ctx.fillStyle = g; ctx.fillRect(x - size * 5, y - size * 5, size * 10, size * 10);
  }
  ctx.restore();
}

/** Kıvılcımlar: bir noktadan dışa saçılan kısa çizgiler (darbe anı). */
export function sparks(ctx, t, t0, { x = W / 2, y = H / 2, count = 90, seed = 7, speed = 900, life = 0.9, spread = Math.PI * 2, dir = 0, alpha = 1 } = {}) {
  const dt = t - t0;
  if (dt < 0 || dt > life * 1.6) return;
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
  const r = rng(seed);
  for (let i = 0; i < count; i++) {
    const ang = dir + (r() - 0.5) * spread, v = speed * (0.25 + r() * 0.9), l = life * (0.4 + r() * 0.8);
    if (dt > l) { r(); continue; }
    const p = dt / l;
    const d = v * dt * (1 - p * 0.45);
    const gy = 260 * dt * dt;
    const px = x + Math.cos(ang) * d, py = y + Math.sin(ang) * d + gy;
    const tail = 0.035 * v;
    const qx = px - Math.cos(ang) * tail * (1 - p), qy = py - Math.sin(ang) * tail * (1 - p) - gy * 0.05;
    const a = (1 - p) * alpha;
    ctx.strokeStyle = `rgba(255,${190 + r() * 50},${120 + r() * 60},${a})`;
    ctx.lineWidth = 1 + r() * 1.6;
    ctx.beginPath(); ctx.moveTo(qx, qy); ctx.lineTo(px, py); ctx.stroke();
  }
  ctx.restore();
}

/** Toz: yavaş süzülen soluk zerreler (sakin sahneler). */
export function dust(ctx, t, { count = 50, seed = 3, alpha = 0.35 } = {}) {
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'screen';
  const r = rng(seed);
  for (let i = 0; i < count; i++) {
    const x = (r() * W + t * (8 + r() * 14)) % W, y = (r() * H - t * (4 + r() * 8) + H * 4) % H;
    const s = 0.6 + r() * 1.8, a = alpha * (0.3 + 0.7 * Math.abs(Math.sin(t * 0.7 + i)));
    ctx.fillStyle = `rgba(236,228,208,${a})`;
    ctx.beginPath(); ctx.arc(x, y, s, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

/** Pirinç darbe çizgileri: merkezden dışa hızla açılan ince ışınlar. */
export function impactLines(ctx, t, t0, { x = W / 2, y = H / 2, count = 26, seed = 4, dur = 0.55, color = '236,209,151' } = {}) {
  const dt = t - t0;
  if (dt < 0 || dt > dur) return;
  const p = dt / dur, r = rng(seed);
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < count; i++) {
    const ang = (i / count) * Math.PI * 2 + r() * 0.2;
    const r0 = 120 + outExpo(p) * 900 * (0.6 + r() * 0.6), len = 80 + r() * 260 * (1 - p);
    ctx.strokeStyle = `rgba(${color},${(1 - p) * (0.4 + r() * 0.5)})`;
    ctx.lineWidth = 1 + r() * 1.5;
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(ang) * r0, y + Math.sin(ang) * r0);
    ctx.lineTo(x + Math.cos(ang) * (r0 + len), y + Math.sin(ang) * (r0 + len));
    ctx.stroke();
  }
  ctx.restore();
}

/** Şok halkası: harita üzerinde genişleyen ince halka (ilan, ilhak). */
export function ring(ctx, t, t0, { x, y, max = 900, dur = 1.1, color = '236,209,151', width = 3 } = {}) {
  const dt = t - t0;
  if (dt < 0 || dt > dur) return;
  const p = outQuart(dt / dur);
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.strokeStyle = `rgba(${color},${(1 - p) * 0.9})`; ctx.lineWidth = width * (1 - p * 0.6);
  ctx.shadowColor = `rgba(${color},0.8)`; ctx.shadowBlur = 16;
  ctx.beginPath(); ctx.arc(x, y, max * p, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
}

/** Işık süpürmesi: diyagonal parlak bant (geçiş ve logo). */
export function lightSweep(ctx, k, { angle = -0.35, width = 260, alpha = 0.22, clip = null } = {}) {
  if (k <= 0 || k >= 1) return;
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (clip) { ctx.beginPath(); ctx.rect(clip.x, clip.y, clip.w, clip.h); ctx.clip(); }
  ctx.globalCompositeOperation = 'screen';
  ctx.translate(-400 + (W + 800) * k, H / 2); ctx.rotate(angle);
  const g = ctx.createLinearGradient(-width / 2, 0, width / 2, 0);
  g.addColorStop(0, 'rgba(255,240,210,0)'); g.addColorStop(0.5, `rgba(255,240,210,${alpha})`); g.addColorStop(1, 'rgba(255,240,210,0)');
  ctx.fillStyle = g; ctx.fillRect(-width / 2, -H * 1.5, width, H * 3);
  ctx.restore();
}

/** Film yanığı: kenardan sızan sıcak ışık (çok kısa, nadiren). */
export function burn(ctx, k, { side = 'left' } = {}) {
  if (k <= 0) return;
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'screen';
  const x = side === 'left' ? 0 : W;
  const g = ctx.createRadialGradient(x, H * 0.4, 0, x, H * 0.4, W * 0.7);
  g.addColorStop(0, `rgba(255,170,90,${0.55 * k})`); g.addColorStop(0.4, `rgba(200,70,30,${0.25 * k})`); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

export const ease = { outQuart, inOutSine };
