// Fragman tipografisi. Oyunun görüntü fontu Georgia; sayılar ve küçük
// etiketler için Bahnschrift (dar, endüstriyel). Hiçbir yazı yalnız opaklıkla
// belirmez: maske açılışı, harf aralığı daralması, pirinç çizgi kurulumu.
import { clamp, invLerp, outExpo, outQuart, inOutCubic, inCubic, outBack } from '../motion/easing.js';

export const IVORY = '#ece4d0';
export const BRASS = '#c29a52';
export const BRASS_HI = '#ecd197';
export const BRASS_LO = '#7d5f2c';
export const BURGUNDY = '#7a1e2b';
export const BURGUNDY_HI = '#b23a46';

export const SERIF = 'Georgia, "Times New Roman", serif';
export const SANS = 'Bahnschrift, "Segoe UI", sans-serif';

export function brassGradient(ctx, x0, y0, x1, y1, sweep = -1) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, BRASS_LO);
  g.addColorStop(0.35, BRASS);
  if (sweep >= 0 && sweep <= 1) {
    // Işık süpürmesi: dar parlak bant gradyan boyunca kayar.
    const a = clamp(sweep - 0.06, 0, 1), b = clamp(sweep, 0, 1), c = clamp(sweep + 0.06, 0, 1);
    g.addColorStop(a, BRASS);
    g.addColorStop(b, '#fff3d0');
    g.addColorStop(c, BRASS);
  } else g.addColorStop(0.55, BRASS_HI);
  g.addColorStop(1, BRASS_LO);
  return g;
}

/**
 * Ana başlık: maske açılışı + harf aralığı daralması + hafif ölçek oturması.
 * opts: { x, y, size, t, t0, t1(çıkış başı), dur, font, color, tracking:[başlangıç, son],
 *         align, from:'below'|'above'|'left', weight, out:'up'|'wipe'|'cut' }
 */
export function title(ctx, text, o) {
  const { t, t0, dur = 0.7, t1 = Infinity, outDur = 0.35 } = o;
  if (t < t0 || t > t1 + outDur) return;
  const kin = outExpo(clamp((t - t0) / dur));
  const kout = t > t1 ? inCubic(clamp((t - t1) / outDur)) : 0;
  const size = o.size ?? 120;
  const [tr0, tr1] = o.tracking ?? [0.6, 0.22];
  const track = (tr0 + (tr1 - tr0) * outQuart(clamp((t - t0) / (dur * 2.2)))) * size;
  ctx.save();
  ctx.font = `${o.weight ?? 'normal'} ${size}px ${o.font ?? SERIF}`;
  ctx.letterSpacing = `${track}px`;
  ctx.textAlign = o.align ?? 'center';
  ctx.textBaseline = 'alphabetic';
  const m = ctx.measureText(text);
  const w = m.width;
  const left = o.align === 'left' ? o.x : o.align === 'right' ? o.x - w : o.x - w / 2;
  const asc = size * 0.78, desc = size * 0.24;
  // Maske: metin kutusu, açılış yönünde kayan pencere.
  ctx.beginPath();
  const from = o.from ?? 'below';
  if (from === 'left') ctx.rect(left - size, o.y - asc - 10, (w + size * 2) * kin, asc + desc + 20);
  else ctx.rect(left - size, o.y - asc - 10, w + size * 2, asc + desc + 20);
  ctx.clip();
  const dy = from === 'below' ? (1 - kin) * size * 0.9 : from === 'above' ? -(1 - kin) * size * 0.9 : 0;
  const oy = (o.out ?? 'up') === 'up' ? -kout * size * 0.9 : 0;
  ctx.globalAlpha = (o.alpha ?? 1) * (o.out === 'fade' ? 1 - kout : 1);
  if (o.shadow !== false) { ctx.shadowColor = 'rgba(0,0,0,0.65)'; ctx.shadowBlur = size * 0.25; }
  const sc = 1 + (1 - outQuart(clamp((t - t0) / (dur * 3)))) * (o.settle ?? 0.04);
  ctx.translate(o.x, o.y + dy + oy);
  ctx.scale(sc, sc);
  ctx.translate(-o.x, -o.y);
  ctx.fillStyle = o.color === 'brass' ? brassGradient(ctx, left, o.y - asc, left + w, o.y, o.sweep ?? -1) : (o.color ?? IVORY);
  ctx.fillText(text, o.x, o.y);
  ctx.restore();
  return { left, w, asc, desc };
}

/** Pirinç çizgi: merkezden iki yana kurulur, sonra ters yönde söner. */
export function brassLine(ctx, { x, y, w, t, t0, dur = 0.6, t1 = Infinity, outDur = 0.4, thick = 2, align = 'center', glow = true }) {
  if (t < t0 || t > t1 + outDur) return;
  const k = outQuart(clamp((t - t0) / dur));
  const ko = t > t1 ? inOutCubic(clamp((t - t1) / outDur)) : 0;
  const len = w * k;
  let a, b;
  if (align === 'center') { a = x - len / 2; b = x + len / 2; }
  else { a = x; b = x + len; }
  if (ko) { const cut = (b - a) * ko; if (align === 'center') { a += cut / 2; b -= cut / 2; } else a += cut; }
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const g = ctx.createLinearGradient(a, 0, b, 0);
  g.addColorStop(0, 'rgba(194,154,82,0)'); g.addColorStop(0.2, BRASS); g.addColorStop(0.5, BRASS_HI);
  g.addColorStop(0.8, BRASS); g.addColorStop(1, 'rgba(194,154,82,0)');
  ctx.fillStyle = g;
  if (glow) { ctx.shadowColor = 'rgba(236,209,151,0.55)'; ctx.shadowBlur = 10; }
  ctx.fillRect(a, y - thick / 2, Math.max(0, b - a), thick);
  ctx.restore();
}

/** Küçük etiket (Bahnschrift, geniş aralık), soldan maskeyle açılır. */
export function label(ctx, text, o) {
  return title(ctx, text, { size: 26, font: SANS, tracking: [0.5, 0.32], from: 'left', dur: 0.5, settle: 0, align: 'left', color: o.color ?? IVORY, shadow: true, ...o });
}

/** Satır vurgusu: alt çizgi soldan çizilir. */
export function underline(ctx, r, t, t0, color = BRASS, dur = 0.45) {
  if (t < t0) return;
  const k = outQuart(clamp((t - t0) / dur));
  ctx.save();
  ctx.fillStyle = color;
  ctx.shadowColor = 'rgba(236,209,151,0.6)'; ctx.shadowBlur = 8;
  ctx.fillRect(r.x, r.y + r.h + 3, r.w * k, 2);
  ctx.restore();
}
