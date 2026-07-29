// Bayrak tarifini Canvas2D'ye çizer. Hem harita etiketlerinde hem HUD'da
// aynı çizim kullanılır; HUD tarafı için sonuç bir kez data URL'e pişirilir.

function starPath(path, cx, cy, outer, inner = outer * 0.42, points = 5) {
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (Math.PI / points) * i - Math.PI / 2;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    if (i === 0) path.moveTo(x, y);
    else path.lineTo(x, y);
  }
  path.closePath();
}

/**
 * Bayrağı (x, y) köşesinden w×h kutusuna çizer.
 * @param {CanvasRenderingContext2D} ctx
 * @param {{pattern:string, colors:string[], emblem:string}} flag
 */
export function drawFlag(ctx, flag, x, y, w, h) {
  const [a, b, c] = flag.colors;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();

  switch (flag.pattern) {
    case 'triband-v': {
      const s = w / 3;
      ctx.fillStyle = a; ctx.fillRect(x, y, s, h);
      ctx.fillStyle = b; ctx.fillRect(x + s, y, s, h);
      ctx.fillStyle = c; ctx.fillRect(x + s * 2, y, w - s * 2, h);
      break;
    }
    case 'triband-h': {
      const s = h / 3;
      ctx.fillStyle = a; ctx.fillRect(x, y, w, s);
      ctx.fillStyle = b; ctx.fillRect(x, y + s, w, s);
      ctx.fillStyle = c; ctx.fillRect(x, y + s * 2, w, h - s * 2);
      break;
    }
    case 'bicolor-h':
      ctx.fillStyle = a; ctx.fillRect(x, y, w, h / 2);
      ctx.fillStyle = c; ctx.fillRect(x, y + h / 2, w, h / 2);
      break;
    case 'bicolor-v':
      ctx.fillStyle = a; ctx.fillRect(x, y, w / 2, h);
      ctx.fillStyle = c; ctx.fillRect(x + w / 2, y, w / 2, h);
      break;
    case 'cross': {
      ctx.fillStyle = a; ctx.fillRect(x, y, w, h);
      ctx.fillStyle = flag.emblem;
      ctx.fillRect(x, y + h * 0.4, w, h * 0.2);
      ctx.fillRect(x + w * 0.4, y, w * 0.2, h);
      break;
    }
    case 'nordic-cross': {
      ctx.fillStyle = a; ctx.fillRect(x, y, w, h);
      ctx.fillStyle = flag.emblem;
      ctx.fillRect(x, y + h * 0.4, w, h * 0.2);
      ctx.fillRect(x + w * 0.28, y, w * 0.18, h);
      break;
    }
    case 'star': {
      ctx.fillStyle = a; ctx.fillRect(x, y, w, h);
      const p = new Path2D();
      starPath(p, x + w / 2, y + h / 2, Math.min(w, h) * 0.34);
      ctx.fillStyle = flag.emblem;
      ctx.fill(p);
      break;
    }
    case 'star-band': {
      ctx.fillStyle = a; ctx.fillRect(x, y, w, h);
      ctx.fillStyle = c; ctx.fillRect(x, y + h * 0.35, w, h * 0.3);
      const p = new Path2D();
      starPath(p, x + w * 0.28, y + h / 2, Math.min(w, h) * 0.26);
      ctx.fillStyle = flag.emblem;
      ctx.fill(p);
      break;
    }
    case 'canton': {
      ctx.fillStyle = c; ctx.fillRect(x, y, w, h);
      ctx.fillStyle = a; ctx.fillRect(x, y, w * 0.45, h * 0.55);
      const p = new Path2D();
      starPath(p, x + w * 0.225, y + h * 0.275, Math.min(w, h) * 0.18);
      ctx.fillStyle = flag.emblem;
      ctx.fill(p);
      break;
    }
    case 'diagonal': {
      ctx.fillStyle = a; ctx.fillRect(x, y, w, h);
      ctx.beginPath();
      ctx.moveTo(x, y + h);
      ctx.lineTo(x + w, y);
      ctx.lineTo(x + w, y + h);
      ctx.closePath();
      ctx.fillStyle = c;
      ctx.fill();
      break;
    }
    default:
      ctx.fillStyle = a;
      ctx.fillRect(x, y, w, h);
  }

  ctx.restore();
  // İnce çerçeve: açık zeminli bayraklar arka planda kaybolmasın.
  ctx.lineWidth = Math.max(0.5, Math.min(w, h) * 0.06);
  ctx.strokeStyle = 'rgba(0,0,0,0.55)';
  ctx.strokeRect(x, y, w, h);
}

/** HUD'da <img> olarak kullanmak için bayrağı bir kez pişirir. */
export function flagDataUrl(nation, width = 36, height = 24) {
  if (nation.flagUrl) return nation.flagUrl;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  drawFlag(ctx, nation.flag, 0, 0, width, height);
  nation.flagUrl = canvas.toDataURL();
  return nation.flagUrl;
}
