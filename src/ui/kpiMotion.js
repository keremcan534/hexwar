// Gösterge kartlarının canlı katmanı: resimdeki meşale yanar, kaynak kıvılcım
// saçar. Kart her tazelemede innerHTML'le yeniden kurulduğu için tuval dinlenen
// ekrana sonradan eklenir; kıvılcımlar karta değil anahtara bağlıdır, haftalık
// tazeleme hareketi kesmez.
//
// Döngü YALNIZ canlı kart ekrandayken döner (harita açıkken hiç dönmez) ve
// 30 karede kalır; harita döngüsünden ayrıdır, game.requestRender'ı tetiklemez.
//
// Katman notu: DOM'a dokunur (ui katmanı), oyun durumunu okumaz.

import { FIRE_TILES, drawFlame, fireFrame } from './fireGL.js';
import { motionOn } from './motion.js';

/** Kart resimlerinin en/boy oranı (assets/kpi/*.webp, 734×311). */
const ART_ASPECT = 734 / 311;
const FRAME_MS = 33;

/**
 * Kart başına hareket. Koordinatlar resmin kendi birimindedir (u, v ∈ 0..1).
 * flames: [u, taban v, en, boy] · sparks: [u, v, saçılma, saniyede parça].
 * Tablo resimlere bakılarak okundu; resim değişirse tablo da değişmeli.
 */
const CARD_FX = {
  unrest: {
    alignTop: true,
    flames: [[0.493, 0.255, 0.07, 0.24], [0.402, 0.395, 0.045, 0.17], [0.602, 0.4, 0.045, 0.17]],
    sparks: [[0.493, 0.13, 0.012, 7, 'rise']],
    // Huzursuzluk arttıkça meşaleler büyür: kart sayıyı bakışta da söyler.
    scaleByValue: 10,
  },
  officers: { flames: [[0.955, 0.71, 0.026, 0.1]] },
  industry: { sparks: [[0.745, 0.86, 0.05, 34, 'burst']] },
  shipyards: { sparks: [[0.827, 0.51, 0.008, 22, 'burst']] },
};

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

class CardFx {
  constructor(key, fx) {
    this.key = key;
    this.fx = fx;
    this.parts = [];
    this.debt = 0;
  }

  /** Kart resmi `cover` + sağa yaslı: resim birimini tuval pikseline çevirir. */
  view(w, h) {
    const scale = Math.max(w / ART_ASPECT, h);
    const artW = scale * ART_ASPECT;
    const artH = scale;
    const left = w - artW;
    const top = this.fx.alignTop ? 0 : (h - artH) / 2;
    return { artW, artH, x: (u) => left + u * artW, y: (v) => top + v * artH };
  }

  spawn(view, dt) {
    for (const [u, v, spread, rate, kind] of this.fx.sparks ?? []) {
      this.debt += rate * dt;
      while (this.debt >= 1) {
        this.debt -= 1;
        const angle = kind === 'rise' ? -Math.PI / 2 + (Math.random() - 0.5) * 0.9 : Math.random() * Math.PI * 2;
        const speed = view.artH * (kind === 'rise' ? 0.12 + Math.random() * 0.16 : 0.2 + Math.random() * 0.5);
        this.parts.push({
          x: view.x(u) + (Math.random() - 0.5) * spread * view.artW,
          y: view.y(v),
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: 0.35 + Math.random() * 0.6,
          age: 0,
          gravity: kind === 'rise' ? -0.05 * view.artH : 0.9 * view.artH,
        });
      }
    }
  }

  draw(ctx, w, h, t, dt, power, frame) {
    const view = this.view(w, h);
    ctx.globalCompositeOperation = 'screen';
    if (frame) {
      (this.fx.flames ?? []).forEach(([u, v, fw, fh], i) => {
        const pulse = clamp(0.8 + 0.2 * Math.sin(t * 9 + i * 2.1), 0, 1);
        const x = view.x(u);
        const y = view.y(v);
        const flameH = fh * view.artH * power;
        // Alevin çevreye vurduğu ışık: onsuz alev resmin üstüne yapıştırılmış duruyor.
        const reach = flameH * 0.95;
        const glow = ctx.createRadialGradient(x, y - flameH * 0.4, 0, x, y - flameH * 0.4, reach);
        glow.addColorStop(0, 'rgba(255, 146, 58, 0.3)');
        glow.addColorStop(0.45, 'rgba(255, 128, 44, 0.09)');
        glow.addColorStop(1, 'rgba(255, 110, 30, 0)');
        ctx.globalAlpha = pulse;
        ctx.fillStyle = glow;
        ctx.fillRect(x - reach, y - flameH * 0.4 - reach, reach * 2, reach * 2);
        drawFlame(ctx, frame, i % FIRE_TILES, x, y, fw * view.artW * power, flameH);
      });
    }
    this.spawn(view, dt);
    ctx.fillStyle = '#ffb765';
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.age += dt;
      if (p.age >= p.life) { this.parts.splice(i, 1); continue; }
      p.vy += p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      ctx.globalAlpha = 1 - p.age / p.life;
      ctx.fillRect(p.x, p.y, 1.5, 1.5);
    }
    ctx.globalAlpha = 1;
  }
}

export class KpiMotion {
  constructor(root = document.getElementById('screen-body')) {
    this.root = root;
    this.cards = new Map();
    this.raf = 0;
    this.last = 0;
    this.t = 0;
    this.onFrame = (now) => this.frame(now);
    if (!root) return;
    new MutationObserver(() => this.scan()).observe(root, { childList: true, subtree: true });
    this.scan();
  }

  scan() {
    if (!motionOn() || document.documentElement.dataset.uiTheme === 'light') return;
    for (const key of Object.keys(CARD_FX)) {
      const card = this.root.querySelector(`.k-kpi[data-kpi="${key}"]`);
      if (!card || card.querySelector(':scope > .k-kpi-fx')) continue;
      const canvas = document.createElement('canvas');
      canvas.className = 'k-kpi-fx';
      canvas.setAttribute('aria-hidden', 'true');
      card.querySelector(':scope > .k-kpi-art')?.after(canvas);
    }
    if (!this.raf && this.root.querySelector('.k-kpi-fx')) {
      this.last = performance.now();
      this.raf = requestAnimationFrame(this.onFrame);
    }
  }

  frame(now) {
    this.raf = 0;
    const live = [...this.root.querySelectorAll('.k-kpi-fx')].filter((canvas) => canvas.offsetParent);
    if (!live.length || !motionOn()) return;
    this.raf = requestAnimationFrame(this.onFrame);
    if (document.hidden || now - this.last < FRAME_MS) return;
    const dt = clamp((now - this.last) / 1000, 0, 0.05);
    this.last = now;
    this.t += dt;
    const frame = fireFrame(this.t);
    for (const canvas of live) this.drawCard(canvas, dt, frame);
  }

  drawCard(canvas, dt, frame) {
    const card = canvas.parentElement;
    const key = card.dataset.kpi;
    const fx = CARD_FX[key];
    if (!fx) return;
    const w = Math.round(canvas.clientWidth);
    const h = Math.round(canvas.clientHeight);
    if (!w || !h) return;
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    let state = this.cards.get(key);
    if (!state) { state = new CardFx(key, fx); this.cards.set(key, state); }
    const value = fx.scaleByValue ? Number.parseFloat(card.querySelector('.k-kpi-body b')?.textContent ?? '') : NaN;
    const power = Number.isFinite(value) ? clamp(0.95 + (value / fx.scaleByValue) * 0.4, 0.95, 1.35) : 1;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, w, h);
    state.draw(ctx, w, h, this.t, dt, power, frame);
  }
}
