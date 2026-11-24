// DİPLOMATİK DURUM HARİTASI (diplomasi masasının ortası, 2026-11-25).
//
// Kerem: "diplomacy ekranı çok boş". Codex'e çizdirilen konsept: ulus defterinin
// yanında bizi ve komşularımızı parşömen üstünde gösteren küçük bir atlas
// levhası; ilişki çizgileri, sınır baskısı okları, bayraklar. Yalnız okur:
// dünyaya yazmaz, oyunun zarına dokunmaz. Seçim ve dosya açma ekranın işidir
// (tıklama `onPick`, çift tık `onOpen` ile döner).
//
// Kâğıt ve pusula resimdir (assets/ui/paper/parsomen.webp, vignette/compass.webp,
// URETIM-LISTESI §28); haritanın kendisi veridir, tuvale çizilir.

import { SQRT3 } from '../core/hex.js';
import { drawFlag } from '../render/flagPainter.js';
import { FONT_DISPLAY, FONT_UI } from '../render/fonts.js';

const PAPER_SRC = 'assets/ui/paper/parsomen.webp';
const COMPASS_SRC = 'assets/ui/vignette/compass.webp';
const INK = 'rgba(48, 34, 18, 0.88)';
const INK_SOFT = 'rgba(64, 48, 28, 0.55)';
const SEA_WASH = 'rgba(52, 84, 104, 0.2)';
const OTHER_LAND = 'rgba(122, 104, 74, 0.13)';

// Çizgi dili (lejant ekranda: renderLegend ile aynı sıra).
export const LINE_STYLES = {
  war: { color: '#9c2a1c', width: 2.6, dash: [] },
  ally: { color: '#2e5b86', width: 2.4, dash: [] },
  friendly: { color: '#3e7436', width: 2.2, dash: [7, 4] },
  neutral: { color: '#4a3a24', width: 1.9, dash: [2, 4] },
  hostile: { color: '#8e3020', width: 2.2, dash: [7, 4] },
};

const images = {};
function image(src, onload) {
  let entry = images[src];
  if (!entry) {
    const img = new Image();
    entry = images[src] = { img, ready: false, waiting: new Set() };
    img.onload = () => {
      entry.ready = true;
      for (const fn of entry.waiting) fn();
      entry.waiting.clear();
    };
    img.src = src;
  }
  if (!entry.ready && onload) entry.waiting.add(onload);
  return entry.ready ? entry.img : null;
}

/** Komşu yoksa (ada ulusu) başkente en yakın üç ulus gösterilir: levha boş kalmasın. */
function shownIds(world, me, rows) {
  const ids = [me.id];
  for (const row of rows) if (row.neighbour) ids.push(row.id);
  if (ids.length > 1) return ids;
  const cap = me.capital;
  if (!cap) return ids;
  const span = world.wrapWidth;
  const near = rows
    .map((row) => {
      const c = world.nations[row.id]?.capital;
      if (!c) return null;
      const dx = Math.abs(((c.x - cap.x + span * 1.5) % span) - span / 2);
      return { id: row.id, d: Math.hypot(dx, c.y - cap.y) };
    })
    .filter(Boolean)
    .sort((a, b) => a.d - b.d)
    .slice(0, 3);
  return ids.concat(near.map((n) => n.id));
}

function styleOf(row) {
  if (!row) return null;
  if (row.standing === 'war' || row.standing === 'crisis') return 'war';
  if (['ally', 'vassal', 'overlord'].includes(row.standing)) return 'ally';
  const v = row.relations?.value ?? 0;
  return v >= 25 ? 'friendly' : v <= -25 ? 'hostile' : 'neutral';
}

/**
 * Levhanın modeli: hangi karolar, nerede, kimin; ulusların etiket noktası.
 * Koordinatlar başkentimize göre açılır (dünya yatay sarmal).
 */
export function situationModel(world, me, rows) {
  const cap = me.capital ?? world.tiles.find((t) => t.owner === me.id);
  if (!cap) return null;
  const span = world.wrapWidth;
  const ux = (t) => ((t.x - cap.x + span * 1.5) % span) - span / 2;
  const ids = shownIds(world, me, rows);
  const shown = new Set(ids);
  let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
  const sums = new Map(ids.map((id) => [id, { x: 0, y: 0, n: 0, tiles: [] }]));
  for (const t of world.tiles) {
    if (!shown.has(t.owner)) continue;
    const x = ux(t);
    const y = t.y - cap.y;
    // Uzak sömürge levhayı okyanus boyu açar: başkentten çok uzak karo kutuya girmez.
    if (Math.abs(x) > span * 0.22) continue;
    const s = sums.get(t.owner);
    s.x += x; s.y += y; s.n += 1; s.tiles.push([x, y]);
    if (x < x0) x0 = x; if (x > x1) x1 = x;
    if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  if (!Number.isFinite(x0)) return null;
  const hex = span / (world.cols * SQRT3);
  const padX = Math.max((x1 - x0) * 0.1, hex * 3);
  const padY = Math.max((y1 - y0) * 0.12, hex * 3);
  const box = { x0: x0 - padX, y0: y0 - padY, x1: x1 + padX, y1: y1 + padY };
  // Etiket noktası: ortalamaya en yakın KENDİ karosu (parçalı ülkede ortalama denize düşer).
  const labels = new Map();
  for (const [id, s] of sums) {
    if (!s.n) continue;
    const mx = s.x / s.n; const my = s.y / s.n;
    let best = s.tiles[0]; let bd = Infinity;
    for (const p of s.tiles) {
      const d = (p[0] - mx) ** 2 + (p[1] - my) ** 2;
      if (d < bd) { bd = d; best = p; }
    }
    labels.set(id, { x: best[0], y: best[1], n: s.n });
  }
  const capOf = (id) => {
    const c = world.nations[id]?.capital;
    return c ? { x: ux(c), y: c.y - cap.y } : null;
  };
  return { world, me, rows, cap, ux, shown, box, hex, labels, capOf, byId: new Map(rows.map((r) => [r.id, r])) };
}

/** Kutudaki karolar: konum, sahip, su mu. Tıklamada da kullanılır. */
function tilesIn(model) {
  const { world, cap, ux, box, hex } = model;
  const out = [];
  const m = hex * 1.2;
  for (const t of world.tiles) {
    const x = ux(t);
    const y = t.y - cap.y;
    if (x < box.x0 - m || x > box.x1 + m || y < box.y0 - m || y > box.y1 + m) continue;
    out.push({ t, x, y });
  }
  return out;
}

function hexPath(ctx, x, y, r) {
  ctx.moveTo(x + r * 0.8660254, y - r * 0.5);
  ctx.lineTo(x + r * 0.8660254, y + r * 0.5);
  ctx.lineTo(x, y + r);
  ctx.lineTo(x - r * 0.8660254, y + r * 0.5);
  ctx.lineTo(x - r * 0.8660254, y - r * 0.5);
  ctx.lineTo(x, y - r);
  ctx.closePath();
}

function cover(ctx, img, w, h) {
  const s = Math.max(w / img.width, h / img.height);
  const dw = img.width * s; const dh = img.height * s;
  ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
}

/** Fildişi gravürü kâğıda mürekkep olarak basar. */
function inkStamp(ctx, img, x, y, size, alpha) {
  const off = document.createElement('canvas');
  off.width = Math.ceil(size); off.height = Math.ceil(size * img.height / img.width);
  const o = off.getContext('2d');
  o.drawImage(img, 0, 0, off.width, off.height);
  o.globalCompositeOperation = 'source-in';
  o.fillStyle = '#3a2a16';
  o.fillRect(0, 0, off.width, off.height);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.drawImage(off, x, y);
  ctx.restore();
}

function arrow(ctx, ax, ay, bx, by, color, width) {
  const dx = bx - ax; const dy = by - ay;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len; const uy = dy / len;
  const nx = -uy; const ny = ux;
  const head = width * 2.6;
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  // Fırça gibi incelen gövde: kuyrukta ince, başa doğru kalın.
  ctx.moveTo(ax + nx * width * 0.2, ay + ny * width * 0.2);
  ctx.lineTo(bx - ux * head + nx * width * 0.55, by - uy * head + ny * width * 0.55);
  ctx.lineTo(bx - ux * head + nx * head * 0.75, by - uy * head + ny * head * 0.75);
  ctx.lineTo(bx, by);
  ctx.lineTo(bx - ux * head - nx * head * 0.75, by - uy * head - ny * head * 0.75);
  ctx.lineTo(bx - ux * head - nx * width * 0.55, by - uy * head - ny * width * 0.55);
  ctx.lineTo(ax - nx * width * 0.2, ay - ny * width * 0.2);
  ctx.closePath();
  ctx.shadowColor = 'rgba(40, 20, 10, 0.35)';
  ctx.shadowBlur = 2;
  ctx.fill();
  ctx.restore();
}

/**
 * Levhayı çizer. `selected`: altın kenarla çevrilen ulus. Dönen nesne tıklama
 * için karo listesini ve ölçeği taşır.
 */
export function drawSituation(canvas, model, selected, redraw) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const cssW = canvas.clientWidth; const cssH = canvas.clientHeight;
  if (cssW < 40 || cssH < 40) return null;
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const paper = image(PAPER_SRC, redraw);
  if (paper) cover(ctx, paper, cssW, cssH);
  else { ctx.fillStyle = '#b9a581'; ctx.fillRect(0, 0, cssW, cssH); }

  const { box, hex, world, shown, labels, me, byId } = model;
  const bw = box.x1 - box.x0; const bh = box.y1 - box.y0;
  const scale = Math.min(cssW / bw, cssH / bh);
  const ox = (cssW - bw * scale) / 2 - box.x0 * scale;
  const oy = (cssH - bh * scale) / 2 - box.y0 * scale;
  const P = (x, y) => [ox + x * scale, oy + y * scale];
  const r = hex * scale * 1.04;
  const tiles = tilesIn(model);
  const nations = world.nations;

  // 1. Deniz yıkaması ve yabancı kara: soluk; gösterilen uluslar kâğıda basılı renk.
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  const groups = new Map();
  for (const it of tiles) {
    const key = it.t.terrain.water ? 'sea' : shown.has(it.t.owner) ? `n${it.t.owner}` : 'land';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(it);
  }
  for (const [key, list] of groups) {
    if (key === 'sea') ctx.fillStyle = SEA_WASH;
    else if (key === 'land') ctx.fillStyle = OTHER_LAND;
    else {
      const id = Number(key.slice(1));
      ctx.fillStyle = nations[id]?.color ?? '#998866';
      ctx.globalAlpha = id === me.id ? 0.62 : 0.5;
    }
    ctx.beginPath();
    for (const it of list) {
      const [x, y] = P(it.x, it.y);
      hexPath(ctx, x, y, r);
    }
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  ctx.restore();

  // 2. Sınırlar: kıyı ince, ülke sınırı mürekkep, seçili ulus altın.
  const ownerAt = new Map(tiles.map((it) => [it.t, it]));
  const coast = new Path2D(); const border = new Path2D(); const sel = new Path2D();
  const edge = (path, a, bx, by) => {
    const [ax, ay] = P(a.x, a.y);
    const [cx, cy] = P(bx, by);
    const mx = (ax + cx) / 2; const my = (ay + cy) / 2;
    const dx = cx - ax; const dy = cy - ay;
    const len = Math.hypot(dx, dy) || 1;
    const hx = (-dy / len) * r * 0.5; const hy = (dx / len) * r * 0.5;
    path.moveTo(mx + hx, my + hy);
    path.lineTo(mx - hx, my - hy);
  };
  for (const it of tiles) {
    if (it.t.terrain.water) continue;
    for (const nb of world.neighbors(it.t)) {
      const other = ownerAt.get(nb);
      const bx = other ? other.x : it.x + (((nb.x - it.t.x + world.wrapWidth * 1.5) % world.wrapWidth) - world.wrapWidth / 2);
      const by = other ? other.y : it.y + (nb.y - it.t.y);
      if (nb.terrain.water) { edge(coast, it, bx, by); continue; }
      if (nb.owner === it.t.owner) continue;
      // Her kara sınırı iki kez görülür: yalnız küçük kimlikli yanda çiz.
      if (selected != null && it.t.owner === selected) edge(sel, it, bx, by);
      if ((it.t.owner ?? -1) < (nb.owner ?? -1)) edge(border, it, bx, by);
    }
  }
  ctx.save();
  ctx.lineCap = 'round';
  ctx.strokeStyle = INK_SOFT; ctx.lineWidth = 1; ctx.stroke(coast);
  ctx.strokeStyle = INK; ctx.lineWidth = 1.4; ctx.stroke(border);
  if (selected != null) {
    ctx.shadowColor = 'rgba(241, 217, 156, 0.95)';
    ctx.shadowBlur = 7;
    ctx.strokeStyle = '#e8c46e'; ctx.lineWidth = 2.6; ctx.stroke(sel);
  }
  ctx.restore();

  // 3. İlişki çizgileri: başkentimizden her komşunun etiketine.
  const mine = labels.get(me.id);
  const meAt = mine ? P(mine.x, mine.y) : null;
  if (meAt) {
    for (const [id, at] of labels) {
      if (id === me.id) continue;
      const st = LINE_STYLES[styleOf(byId.get(id))];
      if (!st) continue;
      const [bx, by] = P(at.x, at.y);
      const dx = bx - meAt[0]; const dy = by - meAt[1];
      const len = Math.hypot(dx, dy);
      if (len < 50) continue;
      const ux = dx / len; const uy = dy / len;
      const a = [meAt[0] + ux * 26, meAt[1] + uy * 22];
      const b = [bx - ux * 26, by - uy * 22];
      ctx.save();
      ctx.strokeStyle = st.color; ctx.lineWidth = st.width; ctx.setLineDash(st.dash); ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
      ctx.setLineDash([]);
      for (const p of [a, b]) {
        ctx.beginPath(); ctx.arc(p[0], p[1], 2.6, 0, Math.PI * 2); ctx.fillStyle = st.color; ctx.fill();
      }
      if (styleOf(byId.get(id)) === 'war') {
        // Çatışma işareti: çizginin ortasında çapraz iki kılıç çizgisi.
        const mx = (a[0] + b[0]) / 2; const my = (a[1] + b[1]) / 2; const s = 6;
        ctx.lineWidth = 2.2;
        ctx.beginPath(); ctx.moveTo(mx - s, my - s); ctx.lineTo(mx + s, my + s); ctx.moveTo(mx + s, my - s); ctx.lineTo(mx - s, my + s); ctx.stroke();
      }
      ctx.restore();
      // Sınır baskısı: bize saldırabilecek komşudan bize doğru kızıl ok.
      const threat = byId.get(id)?.threat?.label;
      if (threat === 'may attack' || threat === 'able, not ready') {
        const t0 = 0.42; const t1 = 0.62;
        arrow(ctx, bx - dx * t0 + uy * 12, by - dy * t0 - ux * 12, bx - dx * t1 + uy * 12, by - dy * t1 - ux * 12,
          threat === 'may attack' ? '#a8321f' : '#b9792a', 3.2);
      }
    }
  }

  // 4. Etiketler: bayrak + ad; bizimki büyük. Kâğıt renginde hale, okunur kalsın.
  // Çakışma: önce biz, sonra seçili, sonra büyükten küçüğe; yer kalmayan etiket bir
  // satır aşağı kayar, orada da yoksa yalnız bayrağı kalır (küçük levhada adlar üst
  // üste binip okunmaz oluyordu).
  const placed = [];
  const hits = (r) => placed.some((q) => r.x < q.x + q.w && q.x < r.x + r.w && r.y < q.y + q.h && q.y < r.y + r.h);
  const order = [...labels.entries()].sort((a, b) => (b[0] === me.id) - (a[0] === me.id)
    || (b[0] === selected) - (a[0] === selected) || b[1].n - a[1].n);
  for (const [id, at] of order) {
    const nation = nations[id];
    if (!nation) continue;
    const [x, y0] = P(at.x, at.y);
    let y = y0;
    const big = id === me.id;
    const fw = big ? 30 : 24; const fh = big ? 20 : 16;
    ctx.save();
    ctx.font = `600 ${big ? 17 : 13}px ${FONT_DISPLAY}`;
    ctx.letterSpacing = big ? '2px' : '1.2px';
    const tw = ctx.measureText((nation.name ?? '').toUpperCase()).width;
    ctx.restore();
    const boxAt = (yy) => ({ x: x - Math.max(tw, fw) / 2 - 2, y: yy - fh - 9, w: Math.max(tw, fw) + 4, h: fh + 9 + (big ? 22 : 18) });
    let showName = true;
    if (hits(boxAt(y))) {
      if (!hits(boxAt(y + 16))) y += 16;
      else showName = false;
    }
    const flagBox = { x: x - fw / 2 - 1, y: y - fh - 9, w: fw + 2, h: fh + 2 };
    if (!showName && hits(flagBox)) continue;
    placed.push(showName ? boxAt(y) : flagBox);
    if (nation.flag) {
      ctx.save();
      ctx.shadowColor = 'rgba(30, 20, 8, 0.45)'; ctx.shadowBlur = 3; ctx.shadowOffsetY = 1;
      ctx.fillStyle = '#2a1d0e'; ctx.fillRect(x - fw / 2 - 1, y - fh - 9, fw + 2, fh + 2);
      ctx.restore();
      drawFlag(ctx, nation.flag, x - fw / 2, y - fh - 8, fw, fh, { frame: false });
    }
    if (!showName) continue;
    ctx.save();
    ctx.font = `600 ${big ? 17 : 13}px ${FONT_DISPLAY}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const text = (nation.name ?? '').toUpperCase();
    ctx.letterSpacing = big ? '2px' : '1.2px';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(222, 204, 166, 0.85)'; ctx.lineWidth = 3.5;
    ctx.strokeText(text, x, y + 2);
    ctx.fillStyle = id === selected ? '#6d4a12' : '#2b1e0f';
    ctx.fillText(text, x, y + 2);
    ctx.restore();
  }

  // 5. Pusula: sağ altta, mürekkep basması.
  const compass = image(COMPASS_SRC, redraw);
  if (compass) {
    const size = Math.min(70, cssH * 0.22);
    inkStamp(ctx, compass, cssW - size - 12, cssH - size - 10, size, 0.5);
  }
  // Kenarda koyu çerçeve gölgesi: levha panele gömülü dursun.
  const g = ctx.createRadialGradient(cssW / 2, cssH / 2, Math.min(cssW, cssH) * 0.45, cssW / 2, cssH / 2, Math.max(cssW, cssH) * 0.75);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(30,18,6,0.35)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, cssW, cssH);
  ctx.font = `11px ${FONT_UI}`;
  return { tiles, scale, ox, oy, r };
}

/** Tuvaldeki noktanın ulusu (en yakın kara karosu, bir hex içinde). */
export function pickAt(drawn, px, py) {
  if (!drawn) return null;
  let best = null; let bd = Infinity;
  for (const it of drawn.tiles) {
    if (it.t.terrain.water || it.t.owner == null || it.t.owner < 0) continue;
    const x = drawn.ox + it.x * drawn.scale; const y = drawn.oy + it.y * drawn.scale;
    const d = (x - px) ** 2 + (y - py) ** 2;
    if (d < bd) { bd = d; best = it; }
  }
  return best && bd <= (drawn.r * 1.3) ** 2 ? best.t.owner : null;
}

/**
 * Ekran yenilendikçe gelen tuvale levhayı takar; boy değişince yeniden çizer.
 * @param {HTMLCanvasElement|null} canvas
 */
export function mountSituation(canvas, model, selected, { onPick, onOpen } = {}) {
  if (!canvas || !model) return;
  let drawn = null;
  const paint = () => {
    if (!canvas.isConnected) return;
    drawn = drawSituation(canvas, model, selected, paint);
  };
  paint();
  const ro = new ResizeObserver(() => {
    if (!canvas.isConnected) { ro.disconnect(); return; }
    paint();
  });
  ro.observe(canvas);
  const at = (event) => {
    const rect = canvas.getBoundingClientRect();
    // Ekran ölçeği (--ui zoom) tuvalin CSS boyunu değiştirir: tıklama oranla çevrilir.
    const sx = canvas.clientWidth / (rect.width || 1);
    const sy = canvas.clientHeight / (rect.height || 1);
    return pickAt(drawn, (event.clientX - rect.left) * sx, (event.clientY - rect.top) * sy);
  };
  // Çift tık tıklama sayısından: ilk tık seçip ekranı yeniden çizer, ikinci tık yeni tuvale düşer.
  canvas.onclick = (event) => {
    const id = at(event);
    if (id == null || id === model.me.id) return;
    if (event.detail >= 2) onOpen?.(id);
    else onPick?.(id);
  };
  canvas.onmousemove = (event) => {
    const id = at(event);
    canvas.style.cursor = id != null && id !== model.me.id ? 'var(--cur-pointer, pointer)' : '';
  };
}
