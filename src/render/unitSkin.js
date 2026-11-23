// Birlik künyesinin malzemesi: arayüzle aynı pirinç çerçeve ve emaye (assets/ui/skin).
//
// Haritadaki sayaç (renderer.paintCounterSprite) ve yakın zoomdaki levha
// (miniatures.paintPlate) aynı künyeyi taşır. Eskiden sayaç siyah zeminli bir levha
// resmiydi; taraf, pirinç simgenin 'color' karışımıyla düz yeşil/kırmızı çizgiye boyanıyor,
// yazı ve çubuklar resmin üstüne ayrı ayrı biniyordu (Kerem: "dandik", "düşük kaliteli png").
// Şimdi gövde tarafın emayesidir (scripts/art/accent-skin.py SIDES), çerçeve pirinç,
// simge emayeye gömülü pirinçtir; çubuklar oyulmuş bir yuvada durur.
//
// Yalnız çizer: dünyayı okumaz, zar çekmez. Dokular gelmeden çağrılırsa düz renkle çizer;
// çağıran, `unitSkinStamp()` anahtarındaki değişimle sprite'ı yeniden pişirir.

const FILES = {
  own: 'taraf/own',
  ally: 'taraf/ally',
  hostile: 'taraf/hostile',
  other: 'dugme',
  brass: 'dugme-secili',
};
/**
 * Kaynak dokuda çerçeve + oluk kalınlığı (px, 124-125 px boyunda düğme). Dokuz dilimin köşe
 * payı tam bu kadardır: kenar dilimleri yalnız pirinç taşır, emaye zemin ortadan alınır.
 */
const SRC_RIM = 11;
/** Dokular gelmeden çizilen düz gövde: taraf aynı tonda okunsun. */
const FLAT = { own: '#2f5a35', ally: '#2b4a72', hostile: '#7a2a20', other: '#2a3236', brass: '#c79a4e' };

const images = new Map();
let asked = false;
let stamp = 0;

/** Dokuları bir kez ister; her biri gelince `onReady` çağrılır (sprite önbelleği boşalsın). */
export function loadUnitSkin(onReady) {
  if (asked) return;
  asked = true;
  for (const [name, file] of Object.entries(FILES)) {
    const image = new Image();
    image.decoding = 'async';
    image.addEventListener('load', () => {
      images.set(name, image);
      stamp++;
      onReady?.();
    }, { once: true });
    image.src = new URL(`../../assets/ui/skin/${file}.webp`, import.meta.url).href;
  }
}

/** Sprite anahtarına girer: doku geldikçe pişmiş künye tazelenir. */
export function unitSkinStamp() {
  return stamp;
}

/**
 * Dokuz dilim: köşeler ve kenarlar `border` kalınlığında, orta kısım kaynağın ortasından HEDEFİN
 * oranında kesilir. Uzun düğme dokusu (3.4:1) sayaca (1.4:1) gerilince çizikler dikine uzuyordu.
 */
function nineSlice(ctx, img, x, y, w, h, border) {
  const sw = img.naturalWidth;
  const sh = img.naturalHeight;
  const s = SRC_RIM;
  const b = Math.min(border, w / 2, h / 2);
  const piece = (sx, sy, sW, sH, dx, dy, dW, dH) => {
    if (dW > 0 && dH > 0 && sW > 0 && sH > 0) ctx.drawImage(img, sx, sy, sW, sH, dx, dy, dW, dH);
  };
  const iw = w - 2 * b;
  const ih = h - 2 * b;
  // Orta: hedef oranında, kaynağın ortasından.
  const cw = sw - 2 * s;
  const ch = sh - 2 * s;
  const want = iw / Math.max(1e-3, ih);
  let tw = cw;
  let th = cw / want;
  if (th > ch) {
    th = ch;
    tw = ch * want;
  }
  piece(s + (cw - tw) / 2, s + (ch - th) / 2, tw, th, x + b, y + b, iw, ih);
  piece(0, 0, s, s, x, y, b, b);
  piece(sw - s, 0, s, s, x + w - b, y, b, b);
  piece(0, sh - s, s, s, x, y + h - b, b, b);
  piece(sw - s, sh - s, s, s, x + w - b, y + h - b, b, b);
  piece(s, 0, sw - 2 * s, s, x + b, y, iw, b);
  piece(s, sh - s, sw - 2 * s, s, x + b, y + h - b, iw, b);
  piece(0, s, s, sh - 2 * s, x, y + b, b, ih);
  piece(sw - s, s, s, sh - 2 * s, x + w - b, y + b, b, ih);
}

/** Düşman künyesi: sol üst ve sağ alt köşesi kesik (renk görmeyen göz biçimden ayırsın). */
export function plaquePath(x, y, w, h, hostile, cut, radius) {
  const p = new Path2D();
  if (hostile) {
    const c = Math.min(cut, w / 2, h / 2);
    p.moveTo(x + c, y);
    p.lineTo(x + w, y);
    p.lineTo(x + w, y + h - c);
    p.lineTo(x + w - c, y + h);
    p.lineTo(x, y + h);
    p.lineTo(x, y + c);
    p.closePath();
  } else p.roundRect(x, y, w, h, radius);
  return p;
}

function brassStroke(ctx, x0, y0, x1, y1, dim = false) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  // Kesik köşe dokunun mat pirincine uysun: cilalı ton yalnız seçili çerçevede.
  g.addColorStop(0, dim ? '#c9a464' : '#f3d79a');
  g.addColorStop(0.45, dim ? '#9a7434' : '#b98a3e');
  g.addColorStop(1, dim ? '#5e4220' : '#6f4f22');
  return g;
}

/**
 * Künye gövdesi: temas gölgesi, emaye zemin, pirinç çerçeve. `px` bir ekran pikselinin bu
 * bağlamdaki boyudur (gölge ve çizgi kalınlığı ekranda sabit kalsın). Dönen yol, üstüne
 * çizilecek içeriğin kırpılacağı gövdedir.
 */
export function paintPlaque(ctx, { x, y, w, h, side, selected = false, rim, cut, px }) {
  const hostile = side === 'hostile';
  const radius = Math.max(px * 1.2, rim * 0.7);
  const body = plaquePath(x, y, w, h, hostile, cut, radius);
  // Temas gölgesi iki katlı: dar ve koyu olan künyeyi zemine oturtur, geniş ve sönük olan
  // havada durmadığını söyler. Halka ya da parlama yok.
  const scale = ctx.getTransform().a;
  ctx.save();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.42)';
  ctx.shadowBlur = 5 * px * scale;
  ctx.shadowOffsetY = 1.6 * px * scale;
  ctx.fill(body);
  ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
  ctx.shadowBlur = 1.4 * px * scale;
  ctx.shadowOffsetY = 0.8 * px * scale;
  ctx.fill(body);
  ctx.restore();

  const skin = images.get(side) ?? images.get('other');
  ctx.save();
  ctx.clip(body);
  if (skin) {
    const q = ctx.imageSmoothingQuality;
    ctx.imageSmoothingQuality = 'high';
    nineSlice(ctx, skin, x, y, w, h, rim * (SRC_RIM / 10));
    ctx.imageSmoothingQuality = q;
  } else {
    ctx.fillStyle = FLAT[side] ?? FLAT.other;
    ctx.fill(body);
  }
  if (hostile) {
    // Kesik köşede dokunun pirinci yarıda kalır: kesik kenar da pirinç kenarla kapanır.
    const c = Math.min(cut, w / 2, h / 2);
    // Oluk, kesik kenara paralel ve çerçeve kalınlığı kadar içeride (iç normal ±(1,1)/√2).
    const g = rim * Math.SQRT1_2;
    ctx.lineCap = 'butt';
    for (const [ax, ay, bx, by, k] of [[x + c, y, x, y + c, 1], [x + w, y + h - c, x + w - c, y + h, -1]]) {
      ctx.lineWidth = rim * 2;
      ctx.strokeStyle = brassStroke(ctx, ax, ay, bx, by, true);
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.stroke();
      ctx.lineWidth = Math.max(px * 0.8, rim * 0.26);
      ctx.strokeStyle = 'rgba(14, 8, 3, 0.85)';
      ctx.beginPath();
      ctx.moveTo(ax + k * g, ay + k * g);
      ctx.lineTo(bx + k * g, by + k * g);
      ctx.stroke();
    }
  }
  if (selected) {
    // Seçili künyenin pirinci cilalanır: çerçeve parlar, dışarıda ayrı bir hale yok.
    ctx.lineWidth = rim * 1.15;
    ctx.strokeStyle = brassStroke(ctx, x, y, x, y + h);
    ctx.globalAlpha = 0.95;
    ctx.stroke(plaquePath(x + rim * 0.5, y + rim * 0.5, w - rim, h - rim, hostile, Math.max(0, cut - rim * 0.3), radius));
    ctx.globalAlpha = 1;
    ctx.lineWidth = Math.max(px * 0.7, rim * 0.22);
    ctx.strokeStyle = 'rgba(255, 246, 214, 0.9)';
    ctx.stroke(plaquePath(x + rim * 0.22, y + rim * 0.22, w - rim * 0.44, h - rim * 0.44, hostile, cut, radius));
  }
  ctx.restore();
  // Dış kenar: künyeyi açık haritadan ayıran kıl payı koyu çizgi.
  ctx.lineWidth = px * 0.9;
  ctx.strokeStyle = 'rgba(8, 6, 4, 0.7)';
  ctx.stroke(body);
  return body;
}

/** Pirinç simge (assets/icons/map-plates): siyah zemin örtüye çevrilir, emayeye gömülür. */
const symbols = new Map();
export function brassSymbol(image, typeId) {
  if (!image) return null;
  let sym = symbols.get(typeId);
  if (sym?.image === image) return sym.canvas;
  // Levha resminin NATO çerçevesi (300x210 kalıbında ölçüldü: x 42-258, y 46-164) + pay.
  const sx = Math.round(image.naturalWidth * 0.12);
  const sy = Math.round(image.naturalHeight * 0.19);
  const sw = Math.round(image.naturalWidth * 0.76);
  const sh = Math.round(image.naturalHeight * 0.62);
  const canvas = document.createElement('canvas');
  canvas.width = sw;
  canvas.height = sh;
  const g = canvas.getContext('2d', { willReadFrequently: true });
  g.drawImage(image, sx, sy, sw, sh, 0, 0, sw, sh);
  const data = g.getImageData(0, 0, sw, sh);
  const p = data.data;
  for (let i = 0; i < p.length; i += 4) {
    const lum = Math.max(p[i], p[i + 1], p[i + 2]) / 255;
    // Siyahın üstündeki pirinç önçarpımlı sayılır: örtü parlaklıktan, renk ondan bölünerek.
    const a = Math.max(0, Math.min(1, (lum - 0.1) / 0.36)) * (p[i + 3] / 255);
    const k = a > 0.02 ? Math.min(1 / a, 4) : 0;
    p[i] = Math.min(255, p[i] * k);
    p[i + 1] = Math.min(255, p[i + 1] * k);
    p[i + 2] = Math.min(255, p[i + 2] * k);
    p[i + 3] = Math.round(a * 255);
  }
  g.putImageData(data, 0, 0);
  symbols.set(typeId, { image, canvas });
  return canvas;
}

/**
 * Kara kolunun NATO simgesi, emayeye gömülü pirinç tel (levha resimleriyle aynı dil: çerçeve +
 * piyade çarpı, süvari tek çapraz, topçu nokta, zırhlı palet). Resimdeki 6 px'lik çizgi 40 px'lik
 * sayaca inince yarım piksele düşüp soluyordu; tel kalınlığı burada aygıt pikselinden incelmez.
 */
export function drawNatoInlay(ctx, typeId, cx, cy, height, px, { bold = false } = {}) {
  // Uzak kademede (bold) tel kalın fildişidir: pirinç tel yeşil/kızıl emayede 30 px'lik
  // sayaçta zemine karışıyor, ne olduğu okunmuyordu (Kerem 2026-11-23: "uzaktan ne olduğu
  // belli olmuyor").
  const lw = bold ? Math.max(px * 2, height * 0.13) : Math.max(px * 1.3, height * 0.09);
  const bw = height * 1.8;
  const x0 = cx - bw / 2;
  const y0 = cy - height / 2;
  const path = new Path2D();
  path.rect(x0, y0, bw, height);
  const fill = new Path2D();
  const ix = lw * 0.5;
  switch (typeId) {
    case 'INFANTRY':
      path.moveTo(x0 + ix, y0 + ix);
      path.lineTo(x0 + bw - ix, y0 + height - ix);
      path.moveTo(x0 + bw - ix, y0 + ix);
      path.lineTo(x0 + ix, y0 + height - ix);
      break;
    case 'CAVALRY':
      path.moveTo(x0 + ix, y0 + height - ix);
      path.lineTo(x0 + bw - ix, y0 + ix);
      break;
    case 'ARTILLERY':
      fill.arc(cx, cy, height * 0.17, 0, Math.PI * 2);
      break;
    case 'ARMOR':
      path.roundRect(cx - bw * 0.33, cy - height * 0.24, bw * 0.66, height * 0.48, height * 0.24);
      break;
    case 'AIRCRAFT':
      fill.moveTo(cx, cy);
      fill.lineTo(cx - bw * 0.3, cy - height * 0.26);
      fill.lineTo(cx - bw * 0.3, cy + height * 0.26);
      fill.closePath();
      fill.moveTo(cx, cy);
      fill.lineTo(cx + bw * 0.3, cy - height * 0.26);
      fill.lineTo(cx + bw * 0.3, cy + height * 0.26);
      fill.closePath();
      break;
    default:
      fill.arc(cx, cy, height * 0.12, 0, Math.PI * 2);
  }
  ctx.save();
  ctx.lineCap = 'square';
  ctx.lineJoin = 'miter';
  if (bold) {
    // Kutunun içi koyu: fildişi simge her emayenin üstünde aynı zıtlıkla okunur.
    ctx.fillStyle = 'rgba(8, 10, 12, 0.42)';
    ctx.fillRect(x0, y0, bw, height);
    ctx.lineWidth = lw + Math.max(px * 1.6, lw * 0.7);
    ctx.strokeStyle = 'rgba(6, 8, 10, 0.85)';
    ctx.fillStyle = 'rgba(6, 8, 10, 0.85)';
    ctx.stroke(path);
    ctx.fill(fill);
    ctx.lineWidth = lw;
    ctx.strokeStyle = '#f4ecd6';
    ctx.fillStyle = '#f4ecd6';
    ctx.stroke(path);
    ctx.fill(fill);
    ctx.restore();
    return;
  }
  ctx.lineWidth = lw;
  // Oyuk: telin altında koyu iz, emayeye gömülü dursun.
  ctx.translate(px * 0.35, px * 0.75);
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.62)';
  ctx.fillStyle = 'rgba(0, 0, 0, 0.62)';
  ctx.stroke(path);
  ctx.fill(fill);
  ctx.translate(-px * 0.35, -px * 0.75);
  const brass = ctx.createLinearGradient(0, y0, 0, y0 + height);
  brass.addColorStop(0, '#f6dc9c');
  brass.addColorStop(0.5, '#d2a656');
  brass.addColorStop(1, '#9c7232');
  ctx.strokeStyle = brass;
  ctx.fillStyle = brass;
  ctx.stroke(path);
  ctx.fill(fill);
  ctx.restore();
}

/** Simgeyi emayeye gömülü basar: altta koyu oyuk gölgesi, üstte pirinç. */
export function drawInlay(ctx, symbol, cx, cy, height, px) {
  const width = height * (symbol.width / symbol.height);
  const scale = ctx.getTransform().a;
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
  ctx.shadowBlur = 1.2 * px * scale;
  ctx.shadowOffsetY = 0.7 * px * scale;
  const q = ctx.imageSmoothingQuality;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(symbol, cx - width / 2, cy - height / 2, width, height);
  ctx.imageSmoothingQuality = q;
  ctx.restore();
}

/**
 * Güç ve düzen çubukları oyulmuş bir yuvada: koyu oluk, altında pirincin ışığı. Düz renk
 * dikdörtgen künyenin üstüne yapıştırılmış gibi duruyordu.
 */
export function paintBars(ctx, x, y, w, barH, gap, strength, organization, px) {
  const pad = Math.max(px * 0.8, barH * 0.35);
  const wellH = barH * 2 + gap + pad * 2;
  ctx.fillStyle = 'rgba(4, 6, 7, 0.9)';
  ctx.fillRect(x - pad, y - pad, w + pad * 2, wellH);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
  ctx.fillRect(x - pad, y - pad, w + pad * 2, Math.max(px * 0.8, pad * 0.5));
  ctx.fillStyle = 'rgba(240, 206, 140, 0.28)';
  ctx.fillRect(x - pad, y - pad + wellH - px * 0.8, w + pad * 2, px * 0.8);
  const bar = (top, value, color) => {
    ctx.fillStyle = '#101417';
    ctx.fillRect(x, top, w, barH);
    if (value <= 0) return;
    ctx.fillStyle = color;
    ctx.fillRect(x, top, w * value, barH);
    ctx.fillStyle = 'rgba(255, 250, 232, 0.2)';
    ctx.fillRect(x, top, w * value, Math.max(px * 0.6, barH * 0.32));
  };
  bar(y, strength, strength > 0.5 ? '#7d9a62' : strength > 0.25 ? '#c0914a' : '#b25b45');
  bar(y + barH + gap, organization, organization > 0.35 ? '#74868e' : organization > 0.15 ? '#c0914a' : '#b25b45');
}

/** Yığın sayısı: künyenin köşesine çakılmış pirinç bir etiket. */
export function paintStackTab(ctx, x, y, w, h, count, font, px) {
  const scale = ctx.getTransform().a;
  const body = new Path2D();
  body.roundRect(x, y, w, h, Math.max(px, h * 0.16));
  ctx.save();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
  ctx.shadowBlur = 1.6 * px * scale;
  ctx.shadowOffsetY = 0.8 * px * scale;
  ctx.fill(body);
  ctx.restore();
  const brass = images.get('brass');
  ctx.save();
  ctx.clip(body);
  if (brass) {
    const q = ctx.imageSmoothingQuality;
    ctx.imageSmoothingQuality = 'high';
    nineSlice(ctx, brass, x, y, w, h, Math.max(px, h * 0.14));
    ctx.imageSmoothingQuality = q;
  } else {
    ctx.fillStyle = FLAT.brass;
    ctx.fill(body);
  }
  ctx.restore();
  ctx.lineWidth = px * 0.8;
  ctx.strokeStyle = 'rgba(40, 24, 6, 0.85)';
  ctx.stroke(body);
  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // Damga: harfin altı açık, kendisi koyu — pirince basılmış gibi.
  ctx.fillStyle = 'rgba(255, 238, 196, 0.6)';
  ctx.fillText(String(count), x + w / 2, y + h / 2 + px * 0.9);
  ctx.fillStyle = '#21160a';
  ctx.fillText(String(count), x + w / 2, y + h / 2 + px * 0.2);
}

/** Bayrak çipi: koyu yuvaya oturmuş, ince pirinç çerçeveli. */
export function paintFlagChip(ctx, flag, x, y, w, h, px) {
  const b = Math.max(px * 0.9, h * 0.1);
  ctx.fillStyle = 'rgba(6, 5, 3, 0.85)';
  ctx.fillRect(x - b, y - b, w + 2 * b, h + 2 * b);
  ctx.strokeStyle = 'rgba(214, 176, 104, 0.85)';
  ctx.lineWidth = px * 0.7;
  ctx.strokeRect(x - b + px * 0.35, y - b + px * 0.35, w + 2 * b - px * 0.7, h + 2 * b - px * 0.7);
  const q = ctx.imageSmoothingQuality;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(flag, x, y, w, h);
  ctx.imageSmoothingQuality = q;
  // Bayrağa kumaşın değil camın ışığı: üst yarıda çok hafif parlaklık.
  ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.fillRect(x, y, w, h * 0.45);
}

/** Fildişi yazı, altında koyu gölge: emaye ve pirinç üstünde de okunur. */
export function paintLabel(ctx, text, x, y, font, px, align = 'right') {
  ctx.font = font;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
  ctx.fillText(text, x + px * 0.5, y + px * 0.9);
  ctx.fillStyle = '#f3e7c8';
  ctx.fillText(text, x, y);
}
