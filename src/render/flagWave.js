// Dalgalanan bayrak: prosedürel bayrağın ÜSTÜNE eklenen bir yüzey efekti.
//
// Bayrak tarifi (world/flags.js) ve çizimi (flagPainter.js) DEĞİŞMEZ. Bu modül
// yalnız çizilmiş yüzeyi deforme eder: kaynak bir kez pişirilir, her karede
// dikey şeritler halinde kaydırılarak çizilir.
//
// Neden şerit warp da CSS dönüşümü değil: bayrağı bütün olarak eğmek ya da
// döndürmek "sallanan karton tabela" veriyor. Bez izlenimi ancak YÜZEYİN
// KENDİSİ deforme olunca doğuyor.
//
// Fizik kuralı tek: genlik soldan sağa artar. Sol kenar gönderdedir, oynamaz;
// sağ kenar serbesttir, en çok o oynar. `smoothstep` ağırlığı bunu verir ve
// efekti inandırıcı kılan asıl ayrıntı budur.
//
// Bütçe: TEK requestAnimationFrame döngüsü bütün bayrakları sürer (bayrak
// başına döngü açılmaz, bkz. CLAUDE.md). Kare 30 Hz'e kısılır, sekme
// gizlenince durur, görünmeyen bayrak çizilmez, döngü içinde tahsis yapılmaz.

import { drawFlag } from './flagPainter.js';

/** Kumaş dokusu: gri tonlamalı, ortalaması 128 — `overlay` altında nötr. */
const CLOTH_URL = 'assets/flag/cloth.png';

/**
 * Görsel ayar sabitleri tek yerde. Oyun ayarı DEĞİLLERDİR; buradan elle
 * kalibre edilirler.
 */
const TUNE = {
  frameMs: 33,        // ~30 Hz; efekt 60 Hz istemiyor
  speed: 1.05,        // ana dalganın hızı
  freq: 2.2,          // ana dalganın uzunluğu (bayrak boyunca)
  speed2: 1.72,       // ikinci, daha hızlı kırışık
  freq2: 4.4,
  amp2: 0.28,         // ikinci dalganın payı — birinciyle asal olmayan oran
  depth: 0.035,       // şeridin dikey ezilmesi: kumaşa derinlik hissi
  shade: 0.17,        // dalgayla BİRLİKTE kayan kıvrım ışığı
  clothAlpha: 0.55,   // dokunun payı; rengi kaybettirmeyecek kadar
};

const LIGHT = '#fff4dc';
const DARK = '#000000';

let clothImage = null;
let clothReady = false;

/** Kumaş dokusu bir kez yüklenir ve bütün bayraklar aynı görüntüyü paylaşır. */
function ensureCloth() {
  if (clothImage) return;
  clothImage = new Image();
  clothImage.decoding = 'async';
  clothImage.addEventListener('load', () => {
    clothReady = true;
    for (const flag of live) bake(flag);   // dokusuz pişenler yeniden pişer
  }, { once: true });
  clothImage.src = CLOTH_URL;
}

/** Şu an sürülen bayraklar. */
const live = new Set();
let rafId = 0;
let lastFrame = 0;

/** Görünürlük: ekrandan çıkan bayrak çizilmez. */
const seen = typeof IntersectionObserver === 'function'
  ? new IntersectionObserver((entries) => {
    for (const entry of entries) {
      const flag = entry.target.__flag;
      if (flag) flag.visible = entry.isIntersecting;
    }
  }, { threshold: 0 })
  : null;

/**
 * Görsel kalibrasyon kancası. Oyun ayarı DEĞİLDİR ve arayüzden erişilmez;
 * sabitleri konsoldan kurcalamak ve azaltılmış-hareket ayarı açık makinede
 * efekti bir kez görebilmek içindir.
 */
export const flagWaveDebug = { tune: TUNE, forceMotion: false };

function reducedMotion() {
  if (flagWaveDebug.forceMotion) return false;
  return typeof matchMedia === 'function'
    && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function loop(now) {
  rafId = requestAnimationFrame(loop);
  if (now - lastFrame < TUNE.frameMs) return;
  lastFrame = now;
  const time = now / 1000;
  for (const flag of live) draw(flag, time);
}

function startClock() {
  if (rafId || document.hidden || !live.size) return;
  lastFrame = 0;
  rafId = requestAnimationFrame(loop);
}

function stopClock() {
  if (!rafId) return;
  cancelAnimationFrame(rafId);
  rafId = 0;
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopClock();
    else startClock();
  });
}

/**
 * Kaynağı pişirir: bayrak + kumaş dokusu, TEK SEFER. Karede yeniden
 * üretilmez — dalgalanma yalnız bu hazır yüzeyi kaydırır.
 */
function bake(flag) {
  const ctx = flag.src.getContext('2d');
  ctx.clearRect(0, 0, flag.w, flag.h);
  drawFlag(ctx, flag.nation.flag, 0, 0, flag.w, flag.h);
  if (clothReady) {
    // Gri doku `overlay` ile biner: 128 nötr olduğu için renk kaymaz,
    // yalnız dokunun açık yerleri açar, koyu yerleri koyultur.
    ctx.globalCompositeOperation = 'overlay';
    ctx.globalAlpha = TUNE.clothAlpha;
    ctx.drawImage(clothImage, 0, 0, flag.w, flag.h);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }
  if (flag.static) blit(flag);
}

/** Hareketsiz durum: kaynağı olduğu gibi bas. */
function blit(flag) {
  flag.ctx.clearRect(0, 0, flag.w, flag.h);
  flag.ctx.drawImage(flag.src, 0, 0);
}

function draw(flag, time) {
  // DOM'dan koparılmış bayrak kendini siler: ekranlar gövdeyi innerHTML ile
  // yeniliyor, ayrı bir sökme çağrısına bel bağlanamaz.
  if (!flag.canvas.isConnected) {
    live.delete(flag);
    if (seen) seen.unobserve(flag.canvas);
    if (!live.size) stopClock();
    return;
  }
  if (!flag.visible) return;

  const { ctx, src, w, h, strips, amp } = flag;
  const sw = w / strips;
  ctx.clearRect(0, 0, w, h);
  for (let i = 0; i < strips; i++) {
    const sx = i * sw;
    const xn = (sx + sw * 0.5) / w;
    // smoothstep(0,1,x): ilk %15 neredeyse durur, sağ kenar tam genlik alır.
    const weight = xn * xn * (3 - 2 * xn);
    const phase = time * TUNE.speed + xn * TUNE.freq;
    const wave = Math.sin(phase)
      + TUNE.amp2 * Math.sin(time * TUNE.speed2 + xn * TUNE.freq2);
    const offset = wave * amp * weight;
    const squash = 1 - TUNE.depth * Math.cos(phase) * weight;
    const dh = h * squash;
    const dy = offset + (h - dh) * 0.5;
    // +1: şeritler arasında yarım piksel dikiş kalmasın.
    // globalAlpha HER ŞERİTTE 1'e döner: gölge için kısılan saydamlık bir
    // sonraki şeridin kendisine sızarsa bayrak soluklaşarak kayboluyor.
    ctx.globalAlpha = 1;
    ctx.drawImage(src, sx, 0, sw, h, sx, dy, sw + 1, dh);

    // Kıvrım ışığı dalganın TÜREVİYLE gider, yani parlaklık kumaşla birlikte
    // kayar. Sabit bir doku fotoğrafı üstte dururken yüzey altında oynasaydı
    // "bez" değil "bozulmuş resim" okunurdu.
    const lum = Math.cos(phase) * weight;
    ctx.globalAlpha = Math.abs(lum) * TUNE.shade;
    ctx.fillStyle = lum > 0 ? LIGHT : DARK;
    ctx.fillRect(sx, dy, sw + 1, dh);
  }
  ctx.globalAlpha = 1;
}

/**
 * Bayrağı bir kaba tak. Aynı kap ikinci kez çağrılırsa canvas yeniden
 * kullanılır; ulus ya da ölçü değişmediyse hiçbir şey yapılmaz.
 *
 * @param {HTMLElement} host kabı — içine canvas konur
 * @param {object} nation `nation.flag` tarifini taşıyan ulus
 * @param {number} cssW CSS pikseli genişlik
 * @param {number} cssH CSS pikseli yükseklik
 */
export function mountFlag(host, nation, cssW, cssH) {
  if (!host || !nation?.flag) return null;
  ensureCloth();

  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = Math.round(cssW * dpr);
  const h = Math.round(cssH * dpr);

  let flag = host.__flag;
  if (flag && flag.nation === nation && flag.w === w && flag.h === h) return flag;

  let canvas = flag?.canvas;
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.className = 'flag-canvas';
    host.replaceChildren(canvas);
  }
  canvas.width = w;
  canvas.height = h;
  canvas.style.width = `${cssW}px`;
  canvas.style.height = `${cssH}px`;

  // LOD: oyuncunun göremeyeceği yere iş yapılmaz.
  //   < 30px  — kıpırtı fark edilmez, hareketsiz bas
  //   < 56px  — 8 şerit, çok küçük genlik
  //   üstü    — 14 şerit, tam kumaş
  const tiny = cssW < 30 || reducedMotion();
  const small = cssW < 56;
  const strips = small ? 8 : 14;
  const ampCss = small ? Math.min(1.2, cssH * 0.035) : Math.min(5, cssH * 0.05);

  const src = flag?.src ?? document.createElement('canvas');
  src.width = w;
  src.height = h;

  flag = {
    canvas, ctx: canvas.getContext('2d'), src,
    nation, w, h, strips,
    amp: ampCss * dpr,
    static: tiny,
    visible: true,
  };
  host.__flag = flag;
  canvas.__flag = flag;
  bake(flag);

  if (tiny) {
    live.delete(flag);
    return flag;
  }
  live.add(flag);
  if (seen) seen.observe(canvas);
  startClock();
  return flag;
}

/**
 * HTML dizesiyle kurulan ekranlar için: `data-flag-nation` taşıyan kapları
 * bulup bayrağı takar. Ekran gövdesi her tazelemede baştan kurulduğu için
 * her tazelemeden sonra çağrılır.
 */
export function hydrateFlags(root, nations) {
  if (!root) return;
  for (const host of root.querySelectorAll('[data-flag-nation]')) {
    const nation = nations?.[Number(host.dataset.flagNation)];
    if (!nation) continue;
    mountFlag(host, nation,
      Number(host.dataset.flagW) || 64, Number(host.dataset.flagH) || 42);
  }
}

/** Ekranda kaç bayrak sürülüyor — ölçüm ve hata ayıklama için. */
export function wavingFlagCount() {
  return live.size;
}
