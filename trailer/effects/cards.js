// Tasarlanmış iki kare: SAVAŞ kartı (parçanın en güçlü darbesi) ve logo.
import { clamp, outExpo, outQuart, inCubic, inOutCubic, shake, outBack, spring } from '../motion/easing.js';
import { W, H } from '../motion/camera.js';
import { title, brassLine, label, IVORY, BRASS, BURGUNDY, SANS, SERIF, brassGradient } from '../typography/type.js';
import * as fx from './fx.js';

/** Dalgalanan bayrak: dikey şeritler, direğe bağlı taraf sabit. */
export function wavingFlag(ctx, img, x, y, w, h, t, { phase = 0, flip = false, amp = 0.06, cloth = null, alpha = 1 } = {}) {
  const N = 64, sw = w / N;
  ctx.save();
  ctx.globalAlpha = alpha;
  for (let i = 0; i < N; i++) {
    const u = (i + 0.5) / N;
    const ua = flip ? 1 - u : u;             // direkten uzaklık
    const wave = Math.sin(ua * 7.5 - t * 6.2 + phase) * 0.7 + Math.sin(ua * 13 - t * 9.1 + phase * 1.7) * 0.3;
    const dy = wave * amp * h * ua;
    const sx = Math.floor((i / N) * img.width), sW = Math.ceil(img.width / N) + 1;
    const scaleY = 1 - Math.abs(wave) * 0.03 * ua;
    ctx.drawImage(img, sx, 0, sW, img.height, x + i * sw, y + dy + (h * (1 - scaleY)) / 2, sw + 1, h * scaleY);
    // Gölgeleme: dalganın eğimi ışığı çevirir.
    const slope = Math.cos(ua * 7.5 - t * 6.2 + phase) * ua;
    ctx.fillStyle = slope > 0 ? `rgba(255,245,225,${slope * 0.16})` : `rgba(0,0,0,${-slope * 0.34})`;
    ctx.fillRect(x + i * sw, y + dy + (h * (1 - scaleY)) / 2, sw + 1, h * scaleY);
  }
  if (cloth) {
    ctx.globalCompositeOperation = 'multiply'; ctx.globalAlpha = 0.35 * alpha;
    ctx.drawImage(cloth, x, y - h * amp, w, h * (1 + 2 * amp));
  }
  ctx.restore();
  // Direk
  ctx.save();
  const px = flip ? x + w + 4 : x - 10;
  const g = ctx.createLinearGradient(px, 0, px + 8, 0);
  g.addColorStop(0, '#5a4220'); g.addColorStop(0.5, '#e2c27f'); g.addColorStop(1, '#5a4220');
  ctx.globalAlpha = alpha; ctx.fillStyle = g; ctx.fillRect(px, y - 30, 7, h + 140);
  ctx.restore();
}

/**
 * SAVAŞ: t0 = darbe anı (34.03). Darbe karesi en güçlü kare olmalı: bayraklar
 * yerinde, beyaz-sıcak flaş, kıvılcım, pirinç çizgiler, sarsıntı.
 */
export function warCard(ctx, t, t0, A, plate) {
  const dt = t - t0;
  const [sx, sy, sr] = shake(dt, 16, 5.5);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#07080b'; ctx.fillRect(0, 0, W, H);
  // Arka plan: cephenin bulanık, kızıl tonlu görüntüsü (derinlik).
  if (plate) {
    ctx.save();
    ctx.translate(W / 2 + sx * 0.5, H / 2 + sy * 0.5); ctx.scale(1.18 + dt * 0.03, 1.18 + dt * 0.03); ctx.translate(-W / 2, -H / 2);
    ctx.filter = 'blur(10px) saturate(0.5) brightness(0.45)';
    ctx.drawImage(plate, 0, 0, W, H);
    ctx.filter = 'none';
    ctx.restore();
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = 'rgba(122,30,43,0.55)'; ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'source-over';
  }
  // Bordo diyagonal ışık
  const g = ctx.createLinearGradient(0, H, W, 0);
  g.addColorStop(0, 'rgba(0,0,0,0.6)'); g.addColorStop(0.5, 'rgba(122,30,43,0.18)'); g.addColorStop(1, 'rgba(0,0,0,0.6)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  fx.smoke(ctx, t, { alpha: 0.22, speed: 40 });

  // Darbe ışınları ve merkez kıvılcımı bayrak/yazının ARKASINDA kalır.
  fx.impactLines(ctx, t, t0, { x: W / 2, y: H / 2 - 20, count: 34, dur: 0.6 });
  fx.sparks(ctx, t, t0, { x: W / 2, y: H / 2 - 150, count: 140, speed: 1300, life: 1.1, seed: 12 });
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.translate(sx, sy); ctx.rotate(sr);
  // Bayraklar: darbe anında yerinde; çok hafif ileri itiş ve sonra ayrılma.
  const settle = 1 + 0.08 * Math.exp(-dt * 9);
  const push = Math.max(0, dt - 1.05) ** 2 * 900;
  const fw = 560, fh = 374, gap = 300;
  ctx.save();
  ctx.translate(W / 2, H / 2); ctx.scale(settle, settle); ctx.translate(-W / 2, -H / 2);
  wavingFlag(ctx, A.flagMe, W / 2 - gap - fw - push, H / 2 - fh / 2 - 30, fw, fh, t, { phase: 0, cloth: A.cloth });
  wavingFlag(ctx, A.flagFoe, W / 2 + gap + push, H / 2 - fh / 2 - 30, fw, fh, t, { phase: 1.3, flip: true, cloth: A.cloth });
  ctx.restore();

  // Merkez: WAR
  title(ctx, 'WAR', { x: W / 2, y: H / 2 + 44, size: 168, t, t0: t0 - 0.2, dur: 0.22, tracking: [0.55, 0.2], color: 'brass', sweep: clamp((dt - 0.1) / 0.9), settle: 0.12, from: 'below' });
  brassLine(ctx, { x: W / 2, y: H / 2 + 92, w: 360, t, t0: t0 - 0.12, dur: 0.35, thick: 2 });
  label(ctx, `${A.names[0].toUpperCase()}   ·   ${A.names[1].toUpperCase()}`, { x: W / 2, y: H / 2 + 148, align: 'center', from: 'below', t, t0: t0 + 0.12, size: 24, color: '#d9cdb4' });
  ctx.restore();

  // Darbe parçacıkları
  fx.sparks(ctx, t, t0 + 0.05, { x: W / 2 - 420, y: H / 2 + 120, count: 50, speed: 700, life: 0.9, seed: 31, dir: -Math.PI / 2, spread: 1.6 });
  fx.sparks(ctx, t, t0 + 0.05, { x: W / 2 + 420, y: H / 2 + 120, count: 50, speed: 700, life: 0.9, seed: 33, dir: -Math.PI / 2, spread: 1.6 });
  fx.embers(ctx, t, { count: 60, seed: 5, area: [0, H * 0.3, W, H * 0.75], rise: 160, intensity: clamp(dt * 3) });
  fx.vignette(ctx, 0.8, 0.3);
  // Flaş: merkezden sıcak patlama; tam ekran beyazlatmaz, kontrast korunur.
  const fk = dt < 0.034 ? 1 : Math.exp(-(dt - 0.034) * 16);
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = 'screen';
  const fg = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, W * 0.55);
  fg.addColorStop(0, `rgba(255,236,200,${0.4 * fk})`); fg.addColorStop(0.35, `rgba(220,120,60,${0.22 * fk})`); fg.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = fg; ctx.fillRect(0, 0, W, H); ctx.restore();
}

/** Final logo, final_world plakası üzerinde. tIn: başlangıç. */
export function logoCard(ctx, t, tIn, A) {
  const d = t - tIn;
  const cx = W / 2, cy = H / 2 - 40;
  // Amblem: ölçek oturması + ışık
  const ek = outExpo(clamp((d - 0.15) / 1.2));
  if (A.eye && d > 0.15) {
    const s = 230 * (0.92 + 0.08 * ek);
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = ek * 0.95;
    // Oyunun menüdeki süzgeci (styles.css .menu-logo): mavi amblem pirince döner.
    ctx.filter = 'saturate(0.5) hue-rotate(168deg) brightness(1.05) drop-shadow(0 4px 16px rgba(0,0,0,0.75))';
    ctx.drawImage(A.eye, cx - s / 2, cy - 230 - s / 2 + 40, s, s);
    ctx.restore();
  }
  // Pirinç çizgiler başlığı kurar.
  brassLine(ctx, { x: cx, y: cy + 4, w: 980, t, t0: tIn + 0.5, dur: 0.9, thick: 1.5 });
  brassLine(ctx, { x: cx, y: cy + 150, w: 980, t, t0: tIn + 0.6, dur: 0.9, thick: 1.5 });
  const sweep = clamp((d - 1.6) / 1.4);
  // Kabartma: koyu alt gölge + açık üst kenar + pirinç dolgu.
  const o = { x: cx, y: cy + 118, size: 128, t, t0: tIn + 0.75, dur: 1.1, tracking: [0.5, 0.16], from: 'below', settle: 0.03, shadow: false };
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.translate(0, 3); title(ctx, 'IMPERIAL EYE', { ...o, color: 'rgba(0,0,0,0.75)' }); ctx.restore();
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.translate(0, -1.5); title(ctx, 'IMPERIAL EYE', { ...o, color: 'rgba(255,240,205,0.35)' }); ctx.restore();
  title(ctx, 'IMPERIAL EYE', { ...o, color: 'brass', sweep: sweep > 0 && sweep < 1 ? sweep : -1 });
  label(ctx, 'EVERY NUMBER TELLS A STORY.', { x: cx, y: cy + 215, align: 'center', from: 'below', t, t0: tIn + 2.3, dur: 0.9, size: 27, tracking: [0.6, 0.38], color: '#ddd3bd' });
}
