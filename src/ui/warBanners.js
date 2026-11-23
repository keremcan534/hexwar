// SAVAŞ SANCAKLARI (Kerem 2026-11-23: "savaş açılınca yanlardan bayrakların aşağıya doğru
// muazzam biçimde salınmasını izlemek hoşuma giderdi; savaşta olduğumuzu hissederdik").
//
// Oyuncu yeni bir savaşa girdiği an (ilan, ültimatomun dolması, ittifak çağrısı, ayaklanma:
// hepsi aynı kapıdan) sekme şeridinin altından uzun dikey sancaklar iner: solda bizimki,
// sağda düşmanınki, ikisi de savaş biçiminde (flagPainter drawSabres: hilal ters döner,
// simgenin ardına kılıç girer). Sancak pirinç çubuktan rulo hâlinde açılır, ağırlığıyla
// sarkıp salınır, birkaç saniye asılı kalır ve yeniden sarılır.
//
// Savaşın başladığı oyundan okunmaz, GÖRÜLÜR: haftalık/olay tazelemesinde düşman kümesi
// karşılaştırılır (hud.showWars). Dünya yüklenince küme sessizce kurulur; kayıttan açılan
// eski savaş yeniden ilan edilmiş gibi oynamaz.
//
// Yalnız görünüştür: simülasyona yazmaz, oyunun zarını çekmez. rAF döngüsü yalnız gösteri
// süresince açıktır (CLAUDE.md: sürekli döngü yok). Hareket kapalıysa (işletim sistemi
// tercihi ya da Settings → Interface animations) sancaklar açılmış hâlde belirip söner.

import { drawFlag } from '../render/flagPainter.js';
import { motionOn } from './motion.js';

/** Süreler (sn): açılma, asılı kalma, sarılma. */
const UNROLL = 1.9;
const HOLD = 4.8;
const ROLL = 1.2;
const TOTAL = UNROLL + HOLD + ROLL;

const GOLD_HI = '#f4e2b0';
const GOLD = '#c9a35a';
const GOLD_LO = '#5a4824';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** Hafif aşım: sancak açılınca ağırlığıyla bir parmak fazla iner, geri toplanır. */
function easeOutBack(t) {
  const c1 = 1.35;
  const c3 = c1 + 1;
  return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
}

/** Dikey sancak bezi: bayrak uzun kutuda çizilip döndürülür, alt kenar kırlangıç kuyruğu. */
function bakeCloth(nation, cw, ch, dpr) {
  const long = document.createElement('canvas');
  long.width = ch;
  long.height = cw;
  // Bayrak boy:en oranı yerine sancağın oranında çizilir: bantlar uzar, simgeler kısa
  // kenara göre ölçeklendiği için yuvarlak kalır (flagPainter boyutları h'den alır).
  drawFlag(long.getContext('2d'), nation.flag, 0, 0, ch, cw, { war: true, frame: false });

  const src = document.createElement('canvas');
  src.width = cw;
  src.height = ch;
  const ctx = src.getContext('2d');
  // Gönder kenarı (sol) üste gelir: yatay bayrak saat yönünde çevrilip asılır.
  ctx.save();
  ctx.translate(cw, 0);
  ctx.rotate(Math.PI / 2);
  ctx.drawImage(long, 0, 0);
  ctx.restore();

  // Kumaşın kendi gölgesi: kenarlar koyu, ortası hafif dolgun; üstte çubuk cebi.
  ctx.globalCompositeOperation = 'source-atop';
  const side = ctx.createLinearGradient(0, 0, cw, 0);
  side.addColorStop(0, 'rgba(0,0,0,0.38)');
  side.addColorStop(0.18, 'rgba(0,0,0,0.04)');
  side.addColorStop(0.55, 'rgba(255,244,220,0.06)');
  side.addColorStop(0.85, 'rgba(0,0,0,0.08)');
  side.addColorStop(1, 'rgba(0,0,0,0.42)');
  ctx.fillStyle = side;
  ctx.fillRect(0, 0, cw, ch);
  const fall = ctx.createLinearGradient(0, 0, 0, ch);
  fall.addColorStop(0, 'rgba(0,0,0,0.35)');
  fall.addColorStop(0.07, 'rgba(0,0,0,0)');
  fall.addColorStop(0.8, 'rgba(0,0,0,0.05)');
  fall.addColorStop(1, 'rgba(0,0,0,0.3)');
  ctx.fillStyle = fall;
  ctx.fillRect(0, 0, cw, ch);
  // Çubuk cebi dikişi.
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fillRect(0, Math.round(ch * 0.055), cw, Math.max(1, dpr));
  ctx.fillStyle = 'rgba(255,240,200,0.18)';
  ctx.fillRect(0, Math.round(ch * 0.055) + Math.max(1, dpr), cw, Math.max(1, dpr));
  ctx.globalCompositeOperation = 'source-over';

  // Kırlangıç kuyruğu: alt kenarın ortası yukarı oyulur.
  const tail = Math.round(cw * 0.42);
  ctx.globalCompositeOperation = 'destination-in';
  // Opak dolgu şart: destination-in kalan alfayı dolgunun alfasıyla çarpar (önceki
  // dikiş renginin %18'i bezi saydamlaştırıyordu).
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(cw, 0);
  ctx.lineTo(cw, ch);
  ctx.lineTo(cw / 2, ch - tail);
  ctx.lineTo(0, ch);
  ctx.closePath();
  ctx.fill();
  ctx.globalCompositeOperation = 'source-over';

  // Sırma kenar: iki yanda ince altın şerit, kuyrukta saçak.
  const trim = Math.max(1.5, cw * 0.035);
  const gold = ctx.createLinearGradient(0, 0, trim * 6, trim * 6);
  gold.addColorStop(0, GOLD_HI);
  gold.addColorStop(0.5, GOLD);
  gold.addColorStop(1, GOLD_LO);
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = trim;
  ctx.beginPath();
  ctx.moveTo(trim / 2, ch * 0.055);
  ctx.lineTo(trim / 2, ch - trim);
  ctx.moveTo(cw - trim / 2, ch * 0.055);
  ctx.lineTo(cw - trim / 2, ch - trim);
  ctx.stroke();
  ctx.lineWidth = Math.max(1, trim * 0.35);
  ctx.strokeStyle = 'rgba(20,14,6,0.6)';
  ctx.beginPath();
  ctx.moveTo(trim + 0.5, ch * 0.055);
  ctx.lineTo(trim + 0.5, ch - tail * 0.2);
  ctx.moveTo(cw - trim - 0.5, ch * 0.055);
  ctx.lineTo(cw - trim - 0.5, ch - tail * 0.2);
  ctx.stroke();
  return { src, tail };
}

/**
 * Kuyruk kenarları boyunca saçak ve uçlarda püskül (sarılı değilken çizilir).
 * `sway` tuval y'sinden yatay kaymayı verir: saçak bezle birlikte salınır.
 */
function drawFringe(ctx, x0, yBottom, cw, tail, dpr, sway) {
  const len = Math.max(4, cw * 0.075);
  ctx.lineWidth = Math.max(1, dpr * 0.9);
  for (const [ax, ay, bx, by] of [[0, 0, cw / 2, -tail], [cw / 2, -tail, cw, 0]]) {
    const steps = Math.ceil(Math.hypot(bx - ax, by - ay) / (2.6 * dpr));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = x0 + ax + (bx - ax) * t + sway(yBottom + ay + (by - ay) * t);
      const y = yBottom + ay + (by - ay) * t;
      ctx.strokeStyle = i % 2 ? GOLD : GOLD_LO;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (sway(y + len) - sway(y)) * 1.6, y + len);
      ctx.stroke();
    }
  }
  for (const ax of [0, cw]) {
    const x = x0 + ax + sway(yBottom);
    const g = ctx.createLinearGradient(x - 4 * dpr, 0, x + 4 * dpr, 0);
    g.addColorStop(0, GOLD_LO);
    g.addColorStop(0.45, GOLD_HI);
    g.addColorStop(1, GOLD_LO);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(x, yBottom + 3 * dpr, 3.2 * dpr, 4 * dpr, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(x - 2.4 * dpr, yBottom + 6 * dpr, 4.8 * dpr, len * 1.6);
  }
}

/** Pirinç asma çubuğu ve iki ucundan sekme şeridinin altına çıkan kordon. */
function drawRod(ctx, cx, rodY, cw, dpr) {
  const over = cw * 0.16;
  const left = cx - cw / 2 - over;
  const right = cx + cw / 2 + over;
  const r = Math.max(2.5, cw * 0.035);
  ctx.strokeStyle = 'rgba(30,22,10,0.9)';
  ctx.lineWidth = Math.max(1, dpr * 1.1);
  ctx.beginPath();
  ctx.moveTo(left + r, rodY);
  ctx.lineTo(cx, 0);
  ctx.lineTo(right - r, rodY);
  ctx.stroke();
  const g = ctx.createLinearGradient(0, rodY - r, 0, rodY + r);
  g.addColorStop(0, GOLD_HI);
  g.addColorStop(0.45, GOLD);
  g.addColorStop(1, GOLD_LO);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.roundRect(left, rodY - r * 0.7, right - left, r * 1.4, r * 0.7);
  ctx.fill();
  for (const x of [left, right]) {
    ctx.beginPath();
    ctx.arc(x, rodY, r * 1.25, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(20,14,6,0.7)';
    ctx.lineWidth = Math.max(0.8, dpr * 0.7);
    ctx.stroke();
  }
}

export class WarBanners {
  constructor(game) {
    this.game = game;
    this.world = null;
    this.known = null;
    this.layer = null;
    this.items = [];
    this.raf = 0;
    this.start = 0;
    this.timer = 0;
  }

  /** hud.showWars her tazelemede çağırır: yeni düşman varsa gösteri başlar. */
  sync(world, me, enemies) {
    const ids = new Set(enemies.map((n) => n.id));
    if (world !== this.world || !this.known) {
      this.world = world;
      this.known = ids;
      this.clear();
      return;
    }
    const fresh = enemies.filter((n) => !this.known.has(n.id));
    this.known = ids;
    if (fresh.length && me?.flag) this.play(me, fresh);
  }

  clear() {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    clearTimeout(this.timer);
    this.layer?.remove();
    this.layer = null;
    this.items = [];
  }

  play(me, enemies) {
    this.clear();
    const W = window.innerWidth;
    const H = window.innerHeight;
    if (W < 200 || H < 300) return;
    const tabBottom = document.getElementById('tab-bar')?.getBoundingClientRect().bottom ?? 150;
    const top = Math.max(0, Math.round(tabBottom) - 4);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const bw = Math.round(clamp(W * 0.072, 84, 150));
    const bh = Math.round(Math.min(H - top - 150, bw * 3.2));
    if (bh < bw * 1.6) return;

    const foes = enemies.filter((n) => n?.flag).slice(0, 2);
    const pairs = Math.max(1, foes.length);
    const slots = [];
    for (let i = 0; i < pairs; i++) {
      const off = W * (0.2 + i * 0.105);
      slots.push({ nation: me, x: W / 2 - off, dir: -1 });
      slots.push({ nation: foes[i] ?? foes[0], x: W / 2 + off, dir: 1 });
    }

    const layer = document.createElement('div');
    layer.className = 'war-banners';
    layer.setAttribute('aria-hidden', 'true');
    document.body.append(layer);
    this.layer = layer;

    const pad = Math.round(bw * 0.45);
    const rodY = 12;
    for (const [i, slot] of slots.entries()) {
      if (!slot.nation) continue;
      const canvas = document.createElement('canvas');
      const cssW = bw + pad * 2;
      const cssH = rodY + bh + 40;
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
      canvas.style.cssText = `left:${Math.round(slot.x - cssW / 2)}px;top:${top}px;width:${cssW}px;height:${cssH}px`;
      layer.append(canvas);
      const cw = Math.round(bw * dpr);
      const ch = Math.round(bh * dpr);
      const { src, tail } = bakeCloth(slot.nation, cw, ch, dpr);
      this.items.push({
        canvas, ctx: canvas.getContext('2d'), src, tail, cw, ch, dpr,
        rodY: rodY * dpr, x0: pad * dpr, dir: slot.dir,
        // Yan yana sancaklar aynı anda açılmasın: dalga gibi, içeriden dışa.
        delay: Math.floor(i / 2) * 0.18 + (i % 2) * 0.06,
        phase: i * 1.7,
      });
    }

    if (!motionOn()) {
      for (const item of this.items) this.draw(item, UNROLL + 1, false);
      layer.classList.add('is-shown');
      this.timer = setTimeout(() => {
        layer.classList.add('is-leaving');
        this.timer = setTimeout(() => this.clear(), 600);
      }, 3600);
      return;
    }
    layer.classList.add('is-shown');
    this.start = performance.now();
    const tick = (now) => {
      const t = (now - this.start) / 1000;
      for (const item of this.items) this.draw(item, t - item.delay, true);
      if (t < TOTAL + 0.5) this.raf = requestAnimationFrame(tick);
      else this.clear();
    };
    this.raf = requestAnimationFrame(tick);
  }

  /** Bir sancağın t anı (sn). */
  draw(item, t, moving) {
    const { ctx, canvas, src, cw, ch, dpr, rodY, x0, tail } = item;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (t < 0) return;
    // Açılma oranı: aşımlı iniş, asılı, sarılış.
    let u;
    if (t < UNROLL) u = clamp(easeOutBack(t / UNROLL), 0, 1.06);
    else if (t < UNROLL + HOLD) u = 1;
    else u = 1 - clamp((t - UNROLL - HOLD) / ROLL, 0, 1) ** 2;
    if (u <= 0.002) return;
    const stretch = Math.max(1, u);
    const L = Math.min(1, u) * ch;

    // Salınım: genlik aşağı doğru büyür (üst kenar çubuktadır). Açılışın sonunda
    // ağırlık savrulur, sonra yavaş bir rüzgâr salınımına iner.
    const since = Math.max(0, t - UNROLL * 0.75);
    const whip = moving ? 1 + 2.2 * Math.exp(-since * 1.25) : 0;
    const ampMax = cw * 0.07 * (moving ? 1 : 0) * whip;
    const k = 2.1;
    const w = 2.3;
    const sway = (y) => {
      const f = clamp(y / ch, 0, 1.2);
      return ampMax * f ** 1.35 * Math.sin(w * t + item.phase - k * f * Math.PI)
        + item.dir * cw * 0.025 * f * (moving ? Math.sin(t * 0.7 + item.phase) : 0);
    };

    const top = rodY;
    const band = Math.max(2, Math.round(2 * dpr));
    for (let y = 0; y < L; y += band) {
      const h = Math.min(band, L - y);
      const dy = y * stretch;
      const off = sway(y);
      ctx.drawImage(src, 0, y, cw, h, x0 + off, top + dy, cw, h * stretch + 0.6);
      // Kıvrım ışığı: eğim yönüne göre açılır/kararır, yalnız kumaşın üstünde.
      const slope = (sway(y + band * 3) - off) / (band * 3);
      const light = clamp(slope * 2.4, -0.32, 0.22);
      if (Math.abs(light) > 0.01) {
        ctx.globalCompositeOperation = 'source-atop';
        ctx.fillStyle = light > 0 ? `rgba(255,240,205,${light})` : `rgba(0,0,0,${-light})`;
        ctx.fillRect(x0 + off - 2, top + dy, cw + 4, h * stretch + 0.6);
        ctx.globalCompositeOperation = 'source-over';
      }
    }

    const bottom = top + L * stretch;
    if (u < 0.995) {
      // Rulo: kalan bez alt kenarda sarılı silindir; açıldıkça incelir.
      const r = Math.max(3 * dpr, cw * 0.11 * Math.sqrt(1 - Math.min(1, u)));
      const off = sway(L);
      const rx = x0 + off - dpr;
      ctx.drawImage(src, 0, Math.max(0, L - r), cw, r, rx, bottom - r * 0.2, cw + 2 * dpr, r * 1.4);
      const g = ctx.createLinearGradient(0, bottom - r * 0.2, 0, bottom + r * 1.2);
      g.addColorStop(0, 'rgba(0,0,0,0.55)');
      g.addColorStop(0.35, 'rgba(255,240,205,0.22)');
      g.addColorStop(1, 'rgba(0,0,0,0.65)');
      ctx.fillStyle = g;
      ctx.fillRect(rx, bottom - r * 0.2, cw + 2 * dpr, r * 1.4);
    } else {
      drawFringe(ctx, x0, bottom, cw, tail, dpr, (cy) => sway((cy - top) / stretch));
    }
    drawRod(ctx, x0 + cw / 2, rodY, cw, dpr);
  }
}
