// Kompozitör: kurgu listesini (scenes/edl.js) kare kare çizer.
// window.renderFrame(n) -> Promise; render.mjs her kareden sonra ekran görüntüsü alır.
import { W, H, sample, apply, contain } from '../motion/camera.js';
import { clamp, inOutCubic, outQuart, inCubic, outExpo } from '../motion/easing.js';
import * as fx from '../effects/fx.js';
import { buildEDL, DURATION } from '../scenes/edl.js';

const FPS = 60;
const canvas = document.getElementById('out');
const out = canvas.getContext('2d');
const layer = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; return c; };
const L = { a: layer(), b: layer(), base: layer(), graded: layer() };

// ---------------------------------------------------------------- varlıklar
const cache = new Map();
const order = [];
function loadImage(url) {
  if (cache.has(url)) return cache.get(url);
  const p = fetch(url).then((r) => { if (!r.ok) throw new Error('yok: ' + url); return r.blob(); }).then((b) => createImageBitmap(b));
  cache.set(url, p); order.push(url);
  // Kare dizileri bellekte birikmesin: en eski 240 görüntüden fazlası atılır.
  while (order.length > 240) { const u = order.shift(); if (!u.includes('/stills/') && !u.includes('/assets/')) cache.delete(u); }
  return p;
}
const seqUrl = (name, f) => `../footage/${name}/${String(f).padStart(4, '0')}.jpg`;

const meta = await (await fetch('../footage/meta.json')).json();
const A = {
  meta,
  flagMe: await loadImage('../footage/stills/flag_me.png').catch(() => null),
  flagFoe: await loadImage('../footage/stills/flag_foe.png').catch(() => null),
  cloth: await loadImage('../../assets/flag/cloth.png').catch(() => null),
  eye: await loadImage('../../assets/menu/eye-mark.png').catch(() => null),
  names: meta.names ?? ['Lorania', 'Eldor'],
};
fx.initGrain(); fx.initSmoke();
const EDL = buildEDL(meta);

// ---------------------------------------------------------------- çekim çizimi
function seqFrame(clip, t) {
  const n = meta.shots?.[clip.name]?.frames ?? clip.frames ?? 1;
  const f = Math.round((clip.start ?? 0) + (t - clip.t0) * (clip.rate ?? FPS));
  return Math.max(0, Math.min(n - 1, clip.hold != null && t >= clip.hold[0] ? Math.round((clip.start ?? 0) + (clip.hold[0] - clip.t0) * (clip.rate ?? FPS)) : f));
}

async function sourceOf(clip, t) {
  if (clip.type === 'seq') return loadImage(seqUrl(clip.name, seqFrame(clip, t)));
  if (clip.type === 'still') return loadImage(`../footage/stills/${clip.name}.png`);
  if (clip.type === 'plate') return loadImage(seqUrl(clip.plate, clip.plateFrame ?? 0));
  return null;
}

// Bir çekimi kendi katmanına çizer (kamera + odak + renk + kaplama).
async function drawClip(clip, t, dst) {
  const c = dst.getContext('2d');
  c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = 1; c.globalCompositeOperation = 'source-over'; c.filter = 'none';
  if (clip.type === 'war' || clip.type === 'logo' || clip.type === 'black') {
    const plate = clip.plate ? await loadImage(seqUrl(clip.plate, clip.plateFrame ?? 0)) : null;
    const b = L.base.getContext('2d');
    if (clip.type === 'black') { c.fillStyle = '#000'; c.fillRect(0, 0, W, H); }
    else if (clip.type === 'war') clip.draw(c, t, A, plate);
    else clip.draw(c, t, A, plate, b);
    return;
  }
  const img = await sourceOf(clip, t);
  const b = L.base.getContext('2d');
  b.setTransform(1, 0, 0, 1, 0, 0); b.fillStyle = '#05070a'; b.fillRect(0, 0, W, H);
  let v = sample(clip.cam, t);
  if (clip.contain !== false) v = contain(v);
  const sh = clip.shake ? clip.shake(t) : [0, 0, 0];
  apply(b, v, sh);
  b.imageSmoothingQuality = 'high';
  b.drawImage(img, 0, 0, W, H);
  b.setTransform(1, 0, 0, 1, 0, 0);
  // Gerçek hareket bulanıklığı: kamera hızından (yalnız hızlı hareketlerde).
  let vp = sample(clip.cam, t - 1 / FPS);
  if (clip.contain !== false) vp = contain(vp);
  const dx = (v.cx - vp.cx) * v.z, dy = (v.cy - vp.cy) * v.z, dz = Math.log(v.z / vp.z);
  const shutter = clip.shutter ?? 0.5;
  if (Math.hypot(dx, dy) * shutter > 3) {
    const tmp = L.graded.getContext('2d');
    tmp.setTransform(1, 0, 0, 1, 0, 0); tmp.clearRect(0, 0, W, H); tmp.drawImage(L.base, 0, 0);
    fx.directionalBlur(b, L.graded, -dx * shutter * 2, -dy * shutter * 2, 10);
  }
  if (Math.abs(dz) * shutter > 0.004) zoomBlur(b, dz * shutter);
  // Odak maskeleri (görüntü uzayındaki dikdörtgenler ekrana izdüşürülür).
  for (const f of clip.focus ?? []) {
    const k = f.k ? f.k(t) : envelope(t, f.t0, f.t1, f.fin ?? 0.35, f.fout ?? 0.3);
    if (k <= 0) continue;
    const r = typeof f.rect === 'function' ? f.rect(t) : f.rect;
    const x0 = W / 2 + (r.x - v.cx) * v.z, y0 = H / 2 + (r.y - v.cy) * v.z;
    fx.focus(b, f.blur ? L.base : null, { x: x0, y: y0, w: r.w * v.z, h: r.h * v.z }, { dim: f.dim ?? 0.72, blur: f.blur ?? 0, feather: (f.feather ?? 22) * Math.min(2, v.z), pad: (f.pad ?? 8) * v.z, k });
  }
  if (clip.under) clip.under(b, t, v, A);
  fx.grade(c, L.base, clip.grade ?? {});
  if (clip.over) clip.over(c, t, v, A);
}

function zoomBlur(b, dz) {
  const tmp = L.graded.getContext('2d');
  tmp.setTransform(1, 0, 0, 1, 0, 0); tmp.clearRect(0, 0, W, H); tmp.drawImage(L.base, 0, 0);
  b.save();
  for (let i = 1; i <= 6; i++) {
    const s = 1 + dz * 2 * (i / 6);
    b.globalAlpha = 0.45 / i;
    b.setTransform(s, 0, 0, s, W / 2 * (1 - s), H / 2 * (1 - s));
    b.drawImage(L.graded, 0, 0);
  }
  b.restore();
}

export function envelope(t, t0, t1, fin = 0.3, fout = 0.3) {
  if (t < t0 || t > t1 + fout) return 0;
  const a = outQuart(clamp((t - t0) / fin));
  const z = t > t1 ? 1 - inCubic(clamp((t - t1) / fout)) : 1;
  return a * z;
}

// ---------------------------------------------------------------- geçişler
function composite(prev, cur, tr, k, t) {
  // prev/cur: tuvaller; k: 0 -> 1 geçiş ilerlemesi
  out.setTransform(1, 0, 0, 1, 0, 0); out.globalAlpha = 1; out.globalCompositeOperation = 'source-over'; out.filter = 'none';
  const type = tr?.type ?? 'cut';
  if (!prev || type === 'cut' || k >= 1) { out.drawImage(cur, 0, 0); return; }
  if (type === 'dissolve') {
    out.drawImage(prev, 0, 0); out.globalAlpha = inOutCubic(k); out.drawImage(cur, 0, 0); out.globalAlpha = 1; return;
  }
  if (type === 'black') {
    // Karartma: önce siyaha, sonra yenisi siyahtan açılır.
    if (k < 0.5) { out.drawImage(prev, 0, 0); fx.black(out, inCubic(k * 2)); }
    else { out.drawImage(cur, 0, 0); fx.black(out, 1 - outQuart((k - 0.5) * 2)); }
    return;
  }
  if (type === 'light') {
    // Işık kesmesi: parlama zirvesinde görüntü değişir.
    out.drawImage(k < 0.5 ? prev : cur, 0, 0);
    fx.flash(out, Math.sin(Math.PI * k) * (tr.amount ?? 0.85));
    return;
  }
  if (type === 'whip') {
    // Whip: ikisi de hareket yönünde kayar ve bulanır; ortada kesilir.
    const dir = tr.dir ?? 1, e = inOutCubic(k), px = (tr.dist ?? 900) * dir;
    const src = k < 0.5 ? prev : cur;
    const off = k < 0.5 ? -px * e * 2 * 0.5 : px * (1 - e) * 2 * 0.5;
    const blur = Math.sin(Math.PI * k) * (tr.blur ?? 260);
    fx.directionalBlur(out, src, blur * dir, 0, 0, off, 0);
    return;
  }
  if (type === 'wipe') {
    // Maskeli silme: pirinç kenarlı çizgi ekranı geçer.
    const e = inOutCubic(k), ang = tr.angle ?? 0.18;
    const x = -200 + (W + 400) * e;
    out.drawImage(prev, 0, 0);
    out.save(); out.beginPath();
    out.moveTo(x - Math.tan(ang) * H, 0); out.lineTo(-10, 0); out.lineTo(-10, H); out.lineTo(x + Math.tan(ang) * 0, H);
    out.closePath(); out.clip(); out.drawImage(cur, 0, 0); out.restore();
    out.save(); out.strokeStyle = '#e6c88a'; out.lineWidth = 2.5; out.shadowColor = 'rgba(236,209,151,0.9)'; out.shadowBlur = 18;
    out.beginPath(); out.moveTo(x - Math.tan(ang) * H, 0); out.lineTo(x, H); out.stroke(); out.restore();
    return;
  }
  if (type === 'iris') {
    // Dairesel açılım (sınır izi): merkezden genişleyen, pirinç halkalı maske.
    const e = inOutCubic(k), R = Math.hypot(W, H) * 0.6 * e, cx = tr.x ?? W / 2, cy = tr.y ?? H / 2;
    out.drawImage(prev, 0, 0);
    out.save(); out.beginPath(); out.arc(cx, cy, R, 0, Math.PI * 2); out.clip(); out.drawImage(cur, 0, 0); out.restore();
    out.save(); out.strokeStyle = `rgba(230,200,138,${1 - e * 0.6})`; out.lineWidth = 2; out.shadowColor = 'rgba(236,209,151,0.9)'; out.shadowBlur = 20;
    out.beginPath(); out.arc(cx, cy, R, 0, Math.PI * 2); out.stroke(); out.restore();
    return;
  }
  out.drawImage(cur, 0, 0);
}

// ---------------------------------------------------------------- kare
let lastErr = null;
window.renderFrame = async (n) => {
  const t = n / FPS;
  try {
    const i = EDL.clips.findIndex((c) => t >= c.t0 && t < c.t1);
    const cur = EDL.clips[i];
    out.setTransform(1, 0, 0, 1, 0, 0);
    out.fillStyle = '#000'; out.fillRect(0, 0, W, H);
    if (cur) {
      await drawClip(cur, t, L.a);
      const tr = cur.in;
      const k = tr && tr.type !== 'cut' ? (t - cur.t0) / tr.dur : 1;
      let prevCanvas = null;
      if (k < 1 && i > 0) { await drawClip(EDL.clips[i - 1], t, L.b); prevCanvas = L.b; }
      composite(prevCanvas, L.a, tr, k, t);
    }
    // Küresel kaplamalar (tipografi, flaş, parçacık): kurgudan.
    for (const g of EDL.globals) if (t >= g.t0 && t < g.t1) g.draw(out, t, A);
    fx.vignette(out, EDL.vignette?.(t) ?? 0.42, 0.5);
    fx.grain(out, n, 0.06);
    const fade = EDL.fade?.(t) ?? 0;
    fx.black(out, fade);
  } catch (e) { lastErr = String(e?.stack ?? e); console.error('kare', n, lastErr); }
  return lastErr;
};
window.compositorReady = { duration: DURATION, clips: EDL.clips.length };
