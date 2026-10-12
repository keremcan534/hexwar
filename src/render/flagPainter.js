// Bayrak tarifini Canvas2D'ye çizer. Hem harita etiketlerinde hem HUD'da
// aynı çizim kullanılır; HUD tarafı için sonuç bir kez data URL'e pişirilir.
//
// Tarif world/flags.js'tendir. Eski kayıtların tarifinde yalnız pattern,
// colors ve emblem vardır; yeni alanlar (charge, shield, fimbria, stripes)
// yoksa çizim eski bayrağı verir.
//
// LOD: harita etiketi bayrağı 18×12 basar. Ekrandaki gerçek boy (dönüşüm
// ölçeğiyle) 18 pikselin altındaysa motifler gölgesiz, dış hatsız ve
// gradyansız çizilir — o boyda ayrıntı okunmaz, yalnız maliyet olur.

const GOLDS = new Set(['#d3a33c', '#e8c34a']);

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
 * Motif boyası. Altın motif sırma gibi dikey ışık alır, beyaz motif hafif
 * kirli keten tonuna iner; düz renk kumaşın üstünde "yapıştırma" duruyordu.
 */
function paint(ctx, color, top, bottom, plain) {
  if (plain) return color;
  if (GOLDS.has(color)) {
    const g = ctx.createLinearGradient(0, top, 0, bottom);
    g.addColorStop(0, '#f6e0a0');
    g.addColorStop(0.5, '#d6a948');
    g.addColorStop(1, '#9b7026');
    return g;
  }
  return color;
}

/** Motifin dış hattı: zeminden ayırır. Küçük boyda çizilmez. */
function outline(ctx, path, size, plain) {
  if (plain) return;
  ctx.lineWidth = Math.max(0.6, size * 0.022);
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.42)';
  ctx.lineJoin = 'round';
  ctx.stroke(path);
}

function crownPath(cx, cy, s) {
  const p = new Path2D();
  // Gövde: üç sivri uç, aralarda iki çukur.
  p.moveTo(cx - s * 0.42, cy + s * 0.2);
  p.lineTo(cx - s * 0.5, cy - s * 0.2);
  p.lineTo(cx - s * 0.24, cy + s * 0.02);
  p.lineTo(cx, cy - s * 0.36);
  p.lineTo(cx + s * 0.24, cy + s * 0.02);
  p.lineTo(cx + s * 0.5, cy - s * 0.2);
  p.lineTo(cx + s * 0.42, cy + s * 0.2);
  p.closePath();
  // Bant.
  p.rect(cx - s * 0.44, cy + s * 0.2, s * 0.88, s * 0.2);
  // Uçlardaki inciler ve tepedeki haç.
  for (const [dx, dy] of [[-0.5, -0.24], [0, -0.41], [0.5, -0.24]]) {
    p.moveTo(cx + dx * s + s * 0.065, cy + dy * s);
    p.arc(cx + dx * s, cy + dy * s, s * 0.065, 0, Math.PI * 2);
  }
  p.rect(cx - s * 0.025, cy - s * 0.58, s * 0.05, s * 0.14);
  p.rect(cx - s * 0.07, cy - s * 0.54, s * 0.14, s * 0.045);
  return p;
}

function drawCrown(ctx, cx, cy, s, color, plain) {
  const p = crownPath(cx, cy, s);
  ctx.fillStyle = paint(ctx, color, cy - s * 0.58, cy + s * 0.4, plain);
  ctx.fill(p);
  outline(ctx, p, s, plain);
  if (plain) return;
  // Banttaki taşlar.
  ctx.fillStyle = 'rgba(120, 20, 24, 0.85)';
  for (const dx of [-0.26, 0, 0.26]) {
    ctx.beginPath();
    ctx.arc(cx + dx * s, cy + s * 0.3, s * 0.045, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawSun(ctx, cx, cy, s, color, plain) {
  const p = new Path2D();
  const rays = 16;
  for (let i = 0; i < rays; i++) {
    const a = (Math.PI * 2 * i) / rays;
    const long = i % 2 === 0 ? 0.5 : 0.38;
    const half = Math.PI / rays * 0.55;
    p.moveTo(cx + Math.cos(a - half) * s * 0.24, cy + Math.sin(a - half) * s * 0.24);
    p.lineTo(cx + Math.cos(a) * s * long, cy + Math.sin(a) * s * long);
    p.lineTo(cx + Math.cos(a + half) * s * 0.24, cy + Math.sin(a + half) * s * 0.24);
    p.closePath();
  }
  p.moveTo(cx + s * 0.22, cy);
  p.arc(cx, cy, s * 0.22, 0, Math.PI * 2);
  ctx.fillStyle = paint(ctx, color, cy - s * 0.5, cy + s * 0.5, plain);
  ctx.fill(p);
  outline(ctx, p, s, plain);
}

/** Hilal + yıldız. Hilal iki dairenin kesişiminden yay yay kurulur. */
function drawCrescent(ctx, cx, cy, s, color, plain) {
  const r1 = s * 0.38;
  const r2 = s * 0.31;
  const c1 = cx - s * 0.08;
  const d = s * 0.12;
  const xi = (d * d + r1 * r1 - r2 * r2) / (2 * d);
  const yi = Math.sqrt(Math.max(0, r1 * r1 - xi * xi));
  const p = new Path2D();
  p.arc(c1, cy, r1, Math.atan2(-yi, xi), Math.atan2(yi, xi), true);
  p.arc(c1 + d, cy, r2, Math.atan2(yi, xi - d), Math.atan2(-yi, xi - d), false);
  p.closePath();
  starPath(p, cx + s * 0.2, cy, s * 0.14);
  ctx.fillStyle = paint(ctx, color, cy - r1, cy + r1, plain);
  ctx.fill(p);
  outline(ctx, p, s, plain);
}

/** Defne çelengi: üstü açık iki dal, ortada küçük yıldız. */
function drawWreath(ctx, cx, cy, s, color, plain) {
  const p = new Path2D();
  const R = s * 0.36;
  for (const side of [-1, 1]) {
    for (let deg = 104; deg <= 246; deg += 13) {
      const a = (side < 0 ? deg : 180 - deg) * Math.PI / 180;
      const px = cx + Math.cos(a) * R;
      const py = cy + Math.sin(a) * R;
      const tangent = a + (side < 0 ? Math.PI / 2 : -Math.PI / 2) + side * 0.5;
      p.moveTo(px + Math.cos(tangent) * s * 0.085, py + Math.sin(tangent) * s * 0.085);
      p.ellipse(px, py, s * 0.085, s * 0.032, tangent, 0, Math.PI * 2);
    }
  }
  starPath(p, cx, cy, s * 0.16);
  ctx.fillStyle = paint(ctx, color, cy - R, cy + R, plain);
  ctx.fill(p);
  outline(ctx, p, s * 0.6, plain);
}

function drawPattee(ctx, cx, cy, s, color, plain) {
  const p = new Path2D();
  for (let k = 0; k < 4; k++) {
    const a = (Math.PI / 2) * k;
    const pt = (r, t) => [cx + Math.cos(a) * r - Math.sin(a) * t, cy + Math.sin(a) * r + Math.cos(a) * t];
    const [x0, y0] = pt(s * 0.05, -s * 0.07);
    p.moveTo(x0, y0);
    p.lineTo(...pt(s * 0.46, -s * 0.21));
    p.quadraticCurveTo(...pt(s * 0.4, 0), ...pt(s * 0.46, s * 0.21));
    p.lineTo(...pt(s * 0.05, s * 0.07));
    p.closePath();
  }
  p.rect(cx - s * 0.08, cy - s * 0.08, s * 0.16, s * 0.16);
  ctx.fillStyle = paint(ctx, color, cy - s * 0.46, cy + s * 0.46, plain);
  ctx.fill(p);
  outline(ctx, p, s, plain);
}

/** Arma: iki renge bölünmüş kalkan, sırma kenar; taçlı devlette üstünde taç. */
function drawArms(ctx, cx, cy, s, shield, emblem, plain) {
  const crowned = shield?.crown;
  const W = s * 0.6;
  const H = s * (crowned ? 0.66 : 0.76);
  const top = cy - H / 2 + (crowned ? s * 0.12 : 0);
  const p = new Path2D();
  p.moveTo(cx - W / 2, top);
  p.lineTo(cx + W / 2, top);
  p.lineTo(cx + W / 2, top + H * 0.55);
  p.quadraticCurveTo(cx + W / 2, top + H * 0.92, cx, top + H);
  p.quadraticCurveTo(cx - W / 2, top + H * 0.92, cx - W / 2, top + H * 0.55);
  p.closePath();
  const [s1, s2] = shield?.colors ?? [emblem, emblem];
  ctx.save();
  ctx.clip(p);
  ctx.fillStyle = s1;
  ctx.fillRect(cx - W, top - s, W * 2, H + s * 2);
  ctx.fillStyle = s2;
  switch (shield?.division) {
    case 'pale': ctx.fillRect(cx, top, W, H); break;
    case 'fess': ctx.fillRect(cx - W, top + H * 0.45, W * 2, H); break;
    case 'bend':
      ctx.beginPath();
      ctx.moveTo(cx - W / 2, top);
      ctx.lineTo(cx + W / 2, top + H);
      ctx.lineTo(cx + W, top + H);
      ctx.lineTo(cx + W, top);
      ctx.closePath();
      ctx.fill();
      break;
    default: {
      const star = new Path2D();
      starPath(star, cx, top + H * 0.45, W * 0.3);
      ctx.fill(star);
    }
  }
  ctx.restore();
  ctx.lineJoin = 'round';
  if (!plain) {
    ctx.lineWidth = Math.max(0.8, s * 0.06);
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.stroke(p);
  }
  ctx.lineWidth = Math.max(0.6, s * 0.035);
  ctx.strokeStyle = paint(ctx, '#d3a33c', top, top + H, plain);
  ctx.stroke(p);
  if (crowned) drawCrown(ctx, cx, top - s * 0.1, s * 0.34, '#d3a33c', plain);
}

function drawCharge(ctx, flag, cx, cy, size, plain) {
  const kind = flag.charge;
  const color = flag.emblem;
  switch (kind) {
    case 'crown': drawCrown(ctx, cx, cy + size * 0.06, size * 0.9, color, plain); break;
    case 'sun': drawSun(ctx, cx, cy, size, color, plain); break;
    case 'crescent': drawCrescent(ctx, cx, cy, size, color, plain); break;
    case 'wreath': drawWreath(ctx, cx, cy, size, color, plain); break;
    case 'cross-pattee': drawPattee(ctx, cx, cy, size, color, plain); break;
    case 'arms': drawArms(ctx, cx, cy, size, flag.shield, color, plain); break;
    case 'star-ring': {
      const p = new Path2D();
      for (let i = 0; i < 8; i++) {
        const a = (Math.PI * 2 * i) / 8 - Math.PI / 2;
        starPath(p, cx + Math.cos(a) * size * 0.36, cy + Math.sin(a) * size * 0.36, size * 0.1);
      }
      ctx.fillStyle = paint(ctx, color, cy - size / 2, cy + size / 2, plain);
      ctx.fill(p);
      outline(ctx, p, size * 0.5, plain);
      break;
    }
    default: {
      const p = new Path2D();
      starPath(p, cx, cy, size * 0.48);
      ctx.fillStyle = paint(ctx, color, cy - size / 2, cy + size / 2, plain);
      ctx.fill(p);
      outline(ctx, p, size, plain);
    }
  }
}

/** İnce ayırıcı şerit: bant sınırına ortalanır. */
function fimH(ctx, color, x, y, w, t) { ctx.fillStyle = color; ctx.fillRect(x, y - t / 2, w, t); }
function fimV(ctx, color, x, y, h, t) { ctx.fillStyle = color; ctx.fillRect(x - t / 2, y, t, h); }

/**
 * Bayrağı (x, y) köşesinden w×h kutusuna çizer.
 * @param {CanvasRenderingContext2D} ctx
 * @param {{pattern:string, colors:string[], emblem:string, charge?:string,
 *   shield?:object, fimbria?:string, stripes?:number}} flag
 * @param {{frame?: boolean}} [options] frame:false — büyük bayrak kendi
 *   dikiş payını taşır, siyah çerçeve onda kalın bir şerit olur
 */
export function drawFlag(ctx, flag, x, y, w, h, options = {}) {
  const [a, b, c] = flag.colors;
  const e = flag.emblem;
  const ink = flag.ink ?? e;
  const fim = flag.fimbria ?? null;
  const m = ctx.getTransform();
  const plain = h * Math.hypot(m.b, m.d) < 18;
  const t = Math.max(1, h * 0.04);
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();

  const charge = (cx, cy, size) => {
    if (flag.charge) drawCharge(ctx, flag, cx, cy, size, plain);
  };

  switch (flag.pattern) {
    case 'triband-v': {
      const s = w / 3;
      ctx.fillStyle = a; ctx.fillRect(x, y, s, h);
      ctx.fillStyle = b; ctx.fillRect(x + s, y, s, h);
      ctx.fillStyle = c; ctx.fillRect(x + s * 2, y, w - s * 2, h);
      if (fim) { fimV(ctx, fim, x + s, y, h, t); fimV(ctx, fim, x + s * 2, y, h, t); }
      charge(x + w / 2, y + h / 2, Math.min(s * 0.92, h * 0.62));
      break;
    }
    case 'triband-h': {
      const s = h / 3;
      ctx.fillStyle = a; ctx.fillRect(x, y, w, s);
      ctx.fillStyle = b; ctx.fillRect(x, y + s, w, s);
      ctx.fillStyle = c; ctx.fillRect(x, y + s * 2, w, h - s * 2);
      if (fim) { fimH(ctx, fim, x, y + s, w, t); fimH(ctx, fim, x, y + s * 2, w, t); }
      charge(x + w / 2, y + h / 2, s * 1.2);
      break;
    }
    case 'triband-wide': {
      ctx.fillStyle = a; ctx.fillRect(x, y, w, h / 4);
      ctx.fillStyle = b; ctx.fillRect(x, y + h / 4, w, h / 2);
      ctx.fillStyle = c; ctx.fillRect(x, y + h * 0.75, w, h / 4);
      if (fim) { fimH(ctx, fim, x, y + h / 4, w, t); fimH(ctx, fim, x, y + h * 0.75, w, t); }
      charge(x + w * 0.33, y + h / 2, h * 0.44);
      break;
    }
    case 'bicolor-h':
      ctx.fillStyle = a; ctx.fillRect(x, y, w, h / 2);
      ctx.fillStyle = c; ctx.fillRect(x, y + h / 2, w, h / 2);
      if (fim) fimH(ctx, fim, x, y + h / 2, w, t);
      charge(x + w / 2, y + h / 2, h * 0.5);
      break;
    case 'bicolor-v':
      ctx.fillStyle = a; ctx.fillRect(x, y, w / 2, h);
      ctx.fillStyle = c; ctx.fillRect(x + w / 2, y, w / 2, h);
      if (fim) fimV(ctx, fim, x + w / 2, y, h, t);
      charge(x + w / 2, y + h / 2, h * 0.5);
      break;
    case 'cross': {
      const arm = h * 0.2;
      ctx.fillStyle = a; ctx.fillRect(x, y, w, h);
      if (fim) {
        ctx.fillStyle = fim;
        ctx.fillRect(x, y + (h - arm) / 2 - t, w, arm + t * 2);
        ctx.fillRect(x + (w - arm) / 2 - t, y, arm + t * 2, h);
      }
      ctx.fillStyle = ink;
      ctx.fillRect(x, y + (h - arm) / 2, w, arm);
      ctx.fillRect(x + (w - arm) / 2, y, arm, h);
      break;
    }
    case 'nordic-cross': {
      const arm = h * 0.2;
      const cx = x + w * 0.37;
      ctx.fillStyle = a; ctx.fillRect(x, y, w, h);
      if (fim) {
        ctx.fillStyle = fim;
        ctx.fillRect(x, y + (h - arm) / 2 - t, w, arm + t * 2);
        ctx.fillRect(cx - arm / 2 - t, y, arm + t * 2, h);
      }
      ctx.fillStyle = ink;
      ctx.fillRect(x, y + (h - arm) / 2, w, arm);
      ctx.fillRect(cx - arm / 2, y, arm, h);
      break;
    }
    case 'saltire': {
      ctx.fillStyle = a; ctx.fillRect(x, y, w, h);
      ctx.lineCap = 'butt';
      const diag = () => {
        ctx.beginPath();
        ctx.moveTo(x, y); ctx.lineTo(x + w, y + h);
        ctx.moveTo(x + w, y); ctx.lineTo(x, y + h);
      };
      if (fim) { diag(); ctx.lineWidth = h * 0.17 + t * 2; ctx.strokeStyle = fim; ctx.stroke(); }
      diag(); ctx.lineWidth = h * 0.17; ctx.strokeStyle = ink; ctx.stroke();
      break;
    }
    case 'star': {
      ctx.fillStyle = a; ctx.fillRect(x, y, w, h);
      const p = new Path2D();
      starPath(p, x + w / 2, y + h / 2, Math.min(w, h) * 0.34);
      ctx.fillStyle = e;
      ctx.fill(p);
      break;
    }
    case 'star-band': {
      ctx.fillStyle = a; ctx.fillRect(x, y, w, h);
      ctx.fillStyle = c; ctx.fillRect(x, y + h * 0.35, w, h * 0.3);
      if (fim) { fimH(ctx, fim, x, y + h * 0.35, w, t); fimH(ctx, fim, x, y + h * 0.65, w, t); }
      const p = new Path2D();
      starPath(p, x + w * 0.28, y + h / 2, Math.min(w, h) * 0.26);
      ctx.fillStyle = paint(ctx, e, y + h * 0.24, y + h * 0.76, plain);
      ctx.fill(p);
      outline(ctx, p, h * 0.5, plain);
      break;
    }
    case 'canton': {
      ctx.fillStyle = c; ctx.fillRect(x, y, w, h);
      ctx.fillStyle = a; ctx.fillRect(x, y, w * 0.45, h * 0.52);
      if (fim) {
        ctx.fillStyle = fim;
        ctx.fillRect(x, y + h * 0.52, w * 0.45 + t, t);
        ctx.fillRect(x + w * 0.45, y, t, h * 0.52 + t);
      }
      // Eski tarif motifsizdi ama kantonunda yıldız vardı.
      if (flag.charge) charge(x + w * 0.225, y + h * 0.26, h * 0.4);
      else {
        const p = new Path2D();
        starPath(p, x + w * 0.225, y + h * 0.275, Math.min(w, h) * 0.18);
        ctx.fillStyle = e;
        ctx.fill(p);
      }
      break;
    }
    case 'stripes': {
      const n = flag.stripes || 7;
      const sh = h / n;
      for (let i = 0; i < n; i++) {
        ctx.fillStyle = i % 2 === 0 ? a : b;
        ctx.fillRect(x, y + i * sh, w, sh + 0.5);
      }
      const ch = sh * Math.ceil(n / 2);
      ctx.fillStyle = c; ctx.fillRect(x, y, w * 0.42, ch);
      charge(x + w * 0.21, y + ch / 2, ch * 0.72);
      break;
    }
    case 'hoist-triangle': {
      ctx.fillStyle = b; ctx.fillRect(x, y, w, h / 2);
      ctx.fillStyle = c; ctx.fillRect(x, y + h / 2, w, h / 2);
      if (fim) fimH(ctx, fim, x, y + h / 2, w, t);
      const tri = new Path2D();
      tri.moveTo(x, y); tri.lineTo(x + w * 0.42, y + h / 2); tri.lineTo(x, y + h); tri.closePath();
      if (fim) { ctx.lineWidth = t * 2; ctx.strokeStyle = fim; ctx.stroke(tri); }
      ctx.fillStyle = a; ctx.fill(tri);
      charge(x + w * 0.14, y + h / 2, h * 0.3);
      break;
    }
    case 'bend': {
      ctx.fillStyle = a; ctx.fillRect(x, y, w, h);
      ctx.beginPath();
      ctx.moveTo(x, y + h); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + h); ctx.closePath();
      ctx.fillStyle = c; ctx.fill();
      ctx.lineCap = 'butt';
      ctx.beginPath(); ctx.moveTo(x - w * 0.05, y + h * 1.05); ctx.lineTo(x + w * 1.05, y - h * 0.05);
      if (fim) { ctx.lineWidth = h * 0.26 + t * 2; ctx.strokeStyle = fim; ctx.stroke(); }
      ctx.lineWidth = h * 0.26; ctx.strokeStyle = ink; ctx.stroke();
      break;
    }
    case 'bordure': {
      const edge = h * 0.11;
      ctx.fillStyle = a; ctx.fillRect(x, y, w, h);
      if (fim) { ctx.fillStyle = fim; ctx.fillRect(x + edge - t, y + edge - t, w - edge * 2 + t * 2, h - edge * 2 + t * 2); }
      ctx.fillStyle = b; ctx.fillRect(x + edge, y + edge, w - edge * 2, h - edge * 2);
      charge(x + w / 2, y + h / 2, h * 0.52);
      break;
    }
    case 'quartered': {
      ctx.fillStyle = b; ctx.fillRect(x, y, w / 2, h / 2);
      ctx.fillStyle = a; ctx.fillRect(x + w / 2, y, w / 2, h / 2);
      ctx.fillStyle = c; ctx.fillRect(x, y + h / 2, w / 2, h / 2);
      ctx.fillStyle = b; ctx.fillRect(x + w / 2, y + h / 2, w / 2, h / 2);
      if (fim) { fimH(ctx, fim, x, y + h / 2, w, t); fimV(ctx, fim, x + w / 2, y, h, t); }
      charge(x + w / 4, y + h / 4, h * 0.32);
      break;
    }
    case 'disc': {
      const r = h * 0.3;
      ctx.fillStyle = b; ctx.fillRect(x, y, w, h);
      ctx.beginPath(); ctx.arc(x + w / 2, y + h / 2, r, 0, Math.PI * 2);
      if (fim) { ctx.lineWidth = t * 2; ctx.strokeStyle = fim; ctx.stroke(); }
      ctx.fillStyle = a; ctx.fill();
      charge(x + w / 2, y + h / 2, r * 1.3);
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
  // İnce çerçeve: açık zeminli bayraklar arka planda kaybolmasın. Kalınlık
  // 1.5 pikselle sınırlı — eskiden boyla büyüyordu ve büyük bayrakta bezin
  // kenarına kalın kara bir şerit çekiyordu.
  if (options.frame === false) return;
  ctx.lineWidth = Math.min(1.5, Math.max(0.5, Math.min(w, h) * 0.06));
  ctx.strokeStyle = 'rgba(0,0,0,0.55)';
  ctx.strokeRect(x, y, w, h);
}

/**
 * HUD'da <img> olarak kullanmak için bayrağı bir kez pişirir.
 *
 * Önbellek anahtarı BOYUTU içerir: tek anahtar kullanılırken ilk çağıran
 * boyutu kilitliyordu, yani rozet 36x24'ü pişirdikten sonra ulus kartı
 * büyük bayrak istese de o küçük kopyayı alıp esnetiyordu.
 */
export function flagDataUrl(nation, width = 36, height = 24) {
  const key = `${width}x${height}`;
  const cache = nation.flagUrls ?? (nation.flagUrls = {});
  if (cache[key]) return cache[key];
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  drawFlag(ctx, nation.flag, 0, 0, width, height);
  cache[key] = canvas.toDataURL();
  return cache[key];
}
