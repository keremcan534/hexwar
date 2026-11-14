// TEMA — koyu (varsayılan) ve "Açık çelik".
//
// Açık tema elle yazılmış ikinci bir stil dosyası DEĞİLDİR. Stil dosyaları
// 2000'den fazla sabit renk taşıyor; elle yazılan bir eş her yeni kuralda
// geride kalır ve koyu adacıklar bırakırdı. Bunun yerine tema açılınca bütün
// kurallar BİR KEZ taranır, renk taşıyan bildirimler OKLab'da çevrilip aynı
// seçicilerle üst katmanlara yazılır (index.html: light-base, light-skin).
// Böylece yeni yazılan her kural açık temada da kendiliğinden doğru renge
// döner. Çevirinin yetmediği yerler (dokular, seçili/tehlike düğme yazısı)
// src/light.css'te durur; o dosya en üst katmandadır ve taranmaz.
//
// Çeviri kuralı (bkz. lightColor): açıklık TERS çevrilir, böylece her yazı-
// zemin çifti koyu temadaki karşıtlığını aşağı yukarı korur. Pirinç ve krem
// tonları çelik maviye döner (açık temada sarımsılık kalmasın); kırmızı,
// yeşil, kehribar gibi anlam taşıyan renkler tonunu korur. Gölgeler fiziksel
// ışıktır: koyu kalır, yalnız hafifler.
//
// Ana menü çevrilmez: tam ekran bir tablonun üstünde durur, açık yazı orada
// doğru yazıdır.

const KEY = 'hexwar:ui-theme';
export const THEMES = ['dark', 'light'];
const LABEL = { dark: 'Dark', light: 'Light steel' };

/** Kaynak katman → açık temadaki eş katman (sıra index.html'de bildirilir). */
const LAYER_OF = { base: 'light-base', skin: 'light-skin' };
const IMPORTANT_LAYER_OF = { base: 'light-imp-base', skin: 'light-imp-skin' };
/** Elle yazılmış açık tema kuralları: zaten açık, taranmaz. */
const SKIP_LAYERS = new Set(['light-fix']);

// --- Renk uzayı -------------------------------------------------------------

const toLin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toGam = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

function toOklch(r, g, b) {
  const R = toLin(r); const G = toLin(g); const B = toLin(b);
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  const L = 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s;
  const Bb = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s;
  const C = Math.hypot(A, Bb);
  let h = (Math.atan2(Bb, A) * 180) / Math.PI;
  if (h < 0) h += 360;
  return [L, C, h];
}

function oklchToRgb(L, C, h) {
  const rad = (h * Math.PI) / 180;
  const A = C * Math.cos(rad);
  const B = C * Math.sin(rad);
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.2914855480 * B) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
  ];
}

/**
 * OKLCH → gama kodlu sRGB (0–1). Gamut dışına taşan renk doygunluğu kısılarak
 * içeri alınır: kanal kırpmak tonu kaydırırdı.
 */
function inGamut(L, C, h) {
  const ok = (v) => v.every((x) => x >= -1e-4 && x <= 1 + 1e-4);
  let lin = oklchToRgb(L, C, h);
  if (!ok(lin)) {
    let lo = 0;
    let hi = C;
    for (let i = 0; i < 14; i++) {
      const mid = (lo + hi) / 2;
      if (ok(oklchToRgb(L, mid, h))) lo = mid; else hi = mid;
    }
    lin = oklchToRgb(L, lo, h);
  }
  return lin.map((x) => toGam(Math.min(1, Math.max(0, x))));
}

// --- Çeviri -----------------------------------------------------------------

/** Çelik mavisi: açık temanın nötr ve vurgu tonu (OKLCH derece). */
const STEEL_HUE = 245;

/**
 * Bir rengi açık temaya çevirir. role 'paint' (yazı, zemin, çizgi) ya da
 * 'shadow' (gölge/parıltı: fiziksel ışık, ters çevrilmez).
 * @returns {[number, number, number, number]} 0–1 sRGB + alfa
 */
export function lightColor(r, g, b, a, role = 'paint') {
  const [L, C, h] = toOklch(r, g, b);
  const brass = C < 0.115 && h >= 45 && h <= 115;
  const neutral = C < 0.02;
  if (role === 'shadow' && L < 0.4 && C < 0.06) {
    // Koyu gölge koyu kalır; açık zeminde aynı opaklık kirli görünür.
    return [...inGamut(Math.min(L, 0.2), Math.min(C, 0.012), STEEL_HUE), a * 0.55];
  }
  if (role === 'shadow' && L > 0.8 && C < 0.06) {
    // Üst kenar parıltısı: açık zeminde de açık kalır.
    return [...inGamut(Math.min(1, L), Math.min(C, 0.01), STEEL_HUE), a];
  }
  if (role === 'halo') {
    // Yazı gölgesi: koyu temadaki kara kabartma açık temada açık bir alt
    // çizgiye döner; tam opaklıkta her yazının altında parlıyordu.
    const [r2, g2, b2] = inGamut(Math.min(0.86, 0.85 - 0.23 * Math.min(L, 0.13)), 0.008, STEEL_HUE);
    return L < 0.3 ? [r2, g2, b2, a * 0.35] : lightColor(r, g, b, a * 0.6, 'paint');
  }
  // Açıklık ters döner. En koyu kademeler (zemin, çukur, panel) sıkışık bir
  // banda iner ki aralarındaki fark kaybolmasın. Tavan bilerek düşük: ilk
  // denemede panel 0.89'du ve oyuncu "çok beyaz, parlıyor" dedi; şimdi en
  // açık yüzey bile 0.85'i geçmez (orta-açık çelik). Dayanak: panel 0.17 →
  // 0.79, gövde metni 0.66 → 0.36, başlık metni 0.86 → 0.19.
  let L2 = L <= 0.13 ? 0.85 - 0.23 * L : 0.82 - 0.86 * (L - 0.13);
  let C2;
  let h2;
  if (neutral || brass) {
    // Pirinç ve krem çelik maviye döner; nötrler hafif soğuk bir çelik alır.
    h2 = STEEL_HUE;
    C2 = neutral ? 0.008 + C * 0.4 : Math.min(0.085, C * 0.8);
  } else {
    // Anlam taşıyan renk tonunu korur; açık zeminde soluk kalmasın diye biraz
    // doyar.
    h2 = h;
    C2 = Math.min(0.3, C * 1.12);
    // Parlak anlam rengi (açık kırmızı yazı) ters dönünce siyaha yaklaşıp
    // kimliğini yitiriyordu: koyu tarafta bir tabanda durur.
    if (C > 0.06) L2 = Math.max(L2, 0.38);
  }
  return [...inGamut(L2, C2, h2), a];
}

const NAMED = {
  white: [255, 255, 255], black: [0, 0, 0], silver: [192, 192, 192], gray: [128, 128, 128],
  grey: [128, 128, 128], red: [255, 0, 0], green: [0, 128, 0], blue: [0, 0, 255],
  orange: [255, 165, 0], gold: [255, 215, 0], goldenrod: [218, 165, 32], ivory: [255, 255, 240],
  beige: [245, 245, 220], wheat: [245, 222, 179], tan: [210, 180, 140], maroon: [128, 0, 0],
  navy: [0, 0, 128], teal: [0, 128, 128], crimson: [220, 20, 60], firebrick: [178, 34, 34],
  darkred: [139, 0, 0],
};
const COLOR_RE = new RegExp(
  '#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![0-9a-zA-Z])'
  + '|rgba?\\([^()]*\\)|hsla?\\([^()]*\\)'
  + `|(?<![-\\w])(?:${Object.keys(NAMED).join('|')})(?![-\\w])`,
  'gi',
);

function parseColor(text) {
  const t = text.trim().toLowerCase();
  if (t[0] === '#') {
    let hex = t.slice(1);
    if (hex.length <= 4) hex = [...hex].map((c) => c + c).join('');
    const n = (i) => parseInt(hex.slice(i, i + 2), 16);
    return [n(0), n(2), n(4), hex.length === 8 ? n(6) / 255 : 1];
  }
  if (NAMED[t]) return [...NAMED[t], 1];
  const fn = t.match(/^(rgba?|hsla?)\((.*)\)$/);
  if (!fn) return null;
  const parts = fn[2].split(/[\s,/]+/).filter(Boolean);
  const num = (p, scale) => (p.endsWith('%') ? (parseFloat(p) / 100) * scale : parseFloat(p));
  let alpha = parts[3] !== undefined ? num(parts[3], 1) : 1;
  if (fn[1].startsWith('rgb')) {
    return [num(parts[0], 255), num(parts[1], 255), num(parts[2], 255), alpha];
  }
  // hsl → rgb
  const H = parseFloat(parts[0]) / 360;
  const S = num(parts[1], 1);
  const Lh = num(parts[2], 1);
  const q = Lh < 0.5 ? Lh * (1 + S) : Lh + S - Lh * S;
  const p = 2 * Lh - q;
  const hue = (x) => {
    const tt = x < 0 ? x + 1 : x > 1 ? x - 1 : x;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };
  alpha = Number.isFinite(alpha) ? alpha : 1;
  return [hue(H + 1 / 3) * 255, hue(H) * 255, hue(H - 1 / 3) * 255, alpha];
}

const fmt = (x) => Math.round(x * 255);
function formatColor([r, g, b, a]) {
  const al = Math.round(a * 1000) / 1000;
  return al >= 1 ? `rgb(${fmt(r)}, ${fmt(g)}, ${fmt(b)})` : `rgba(${fmt(r)}, ${fmt(g)}, ${fmt(b)}, ${al})`;
}

/** Bir bildirim değerindeki bütün renkleri çevirir. */
export function lightValue(value, role = 'paint') {
  return value.replace(COLOR_RE, (match) => {
    const c = parseColor(match);
    if (!c || c.some((x) => !Number.isFinite(x))) return match;
    if (c[3] <= 0) return match;
    return formatColor(lightColor(c[0] / 255, c[1] / 255, c[2] / 255, c[3], role));
  });
}

// --- Kuralları tarama ---------------------------------------------------------

/**
 * Renkle ilgili özellikler. Bunların BÜTÜN bildirimleri kopyalanır, sabit renk
 * taşımasalar da (var(), inherit, none): kopya katmanı asıllardan üstte
 * olduğu için, kopyalanmayan bir bildirim kendi katmanındaki yarışı
 * kaybederdi (ölçüldü: seçili düğmenin var() ile verilen yazı rengi, alttaki
 * kuralın çevrilmiş rengine yeniliyordu). Hepsi kopyalanınca özgüllük ve
 * katman yarışı kopyalarda aynen yeniden oynanır, kazanan değişmez.
 */
const COLOR_PROP = new RegExp('^(color|background(-color|-image)?|border(-(top|right|bottom|left|block|inline)'
  + '(-(start|end))?)?(-color)?|border-image(-source)?|box-shadow|text-shadow|outline(-color)?|fill|stroke'
  + '|filter|-webkit-filter|backdrop-filter|caret-color|text-decoration(-color)?|-webkit-text-fill-color'
  + '|-webkit-text-stroke(-color)?|accent-color|column-rule(-color)?|stop-color|flood-color|lighting-color'
  + '|scrollbar-color|text-emphasis-color)$');
const SHADOW_PROP = /^(box-shadow|filter|-webkit-filter|backdrop-filter)$/;
const SHADOW_VAR = /shadow|drop|glow|frame-glass/;
/** var() taşıyan kısaltmada uzun hâller boş okunur; değer kısaltmadan alınır. */
const SHORTHANDS = ['background', 'border', 'border-top', 'border-right', 'border-bottom', 'border-left',
  'border-color', 'border-block', 'border-inline', 'border-block-start', 'border-block-end',
  'border-inline-start', 'border-inline-end', 'outline', 'text-decoration', 'column-rule', 'border-image'];

const roleOf = (prop) => {
  if (SHADOW_PROP.test(prop) || (prop.startsWith('--') && SHADOW_VAR.test(prop))) return 'shadow';
  return prop === 'text-shadow' ? 'halo' : 'paint';
};
const hasColor = (value) => { COLOR_RE.lastIndex = 0; return COLOR_RE.test(value); };

/**
 * Çevrilmeyen seçiciler: ana menü (tam ekran tablonun üstünde, açık yazı orada
 * doğru yazıdır) ve haritanın ya da bir resmin ÜSTÜNDEKİ ışık katmanları
 * (kenar karartması) ve saatin kâğıt takvim yaprağı (kâğıt her temada kâğıttır).
 * Işık temadan bağımsızdır;
 * çevrilince harita kenarı beyaz sise dönüyordu.
 */
const KEEP_SEL = /(^|[\s>+~(,])(#menu(?![\w-])|\.menu(?![\w])|\.menu-|#map(?![\w])|#map-|\.tc-(cal|month|day)(?![\w-]))|^body::before$/;

/** Seçici listesini üst düzey virgüllerden böler (:is(a, b) içini bölmez). */
function splitSelectors(text) {
  const out = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '(' || c === '[') depth++;
    else if (c === ')' || c === ']') depth--;
    else if (c === ',' && depth === 0) { out.push(text.slice(start, i).trim()); start = i + 1; }
  }
  out.push(text.slice(start).trim());
  return out.filter(Boolean);
}

function declsOf(style, { all = false } = {}) {
  const normal = [];
  const important = [];
  const push = (prop, value) => {
    // Belge içi başvuru (url(#süzgeç)) kopyada dosyanın adresine göre çözülür
    // ve kırılır: öğe hiç çizilmez (ölçüldü). Böyle değer kopyalanmaz.
    if (/url\(\s*["']?#/.test(value)) return;
    const next = hasColor(value) ? lightValue(value, roleOf(prop)) : value;
    const line = `${prop}: ${next}`;
    if (style.getPropertyPriority(prop)) important.push(`${line} !important`); else normal.push(line);
  };
  // var() taşıyan kısaltma: uzun hâlleri boş okunur, değer kısaltmadan alınır.
  for (const sh of SHORTHANDS) {
    const value = style.getPropertyValue(sh);
    if (value && value.includes('var(')) push(sh, value);
  }
  for (let i = 0; i < style.length; i++) {
    const prop = style[i];
    const value = style.getPropertyValue(prop);
    if (!value) continue;
    if (all || prop.startsWith('--') || COLOR_PROP.test(prop)) push(prop, value);
  }
  return { normal, important };
}

/**
 * Bir kural listesini açık eşine çevirir. Dönen iki metin aynı yapıyı taşır:
 * olağan bildirimler ve !important olanlar (önemli bildirimlerde katman sırası
 * tersine döner, o yüzden ayrı ve ÖNCE bildirilen katmana gider).
 */
function convertRules(rules) {
  let normal = '';
  let important = '';
  for (const rule of rules) {
    if (rule instanceof CSSStyleRule) {
      const sels = splitSelectors(rule.selectorText).filter((s) => !KEEP_SEL.test(s));
      if (!sels.length) continue;
      const d = declsOf(rule.style);
      const sel = sels.join(', ');
      if (d.normal.length) normal += `${sel} { ${d.normal.join('; ')} }\n`;
      if (d.important.length) important += `${sel} { ${d.important.join('; ')} }\n`;
    } else if (rule instanceof CSSMediaRule || rule instanceof CSSSupportsRule
      || (typeof CSSContainerRule !== 'undefined' && rule instanceof CSSContainerRule)) {
      const kind = rule instanceof CSSMediaRule ? '@media' : rule instanceof CSSSupportsRule ? '@supports' : '@container';
      const inner = convertRules(rule.cssRules);
      if (inner.normal) normal += `${kind} ${rule.conditionText} {\n${inner.normal}}\n`;
      if (inner.important) important += `${kind} ${rule.conditionText} {\n${inner.important}}\n`;
    } else if (rule instanceof CSSKeyframesRule) {
      // Anahtar kare kümesi bütünüyle değişir: renkli bir karesi varsa hepsi kopyalanır.
      const frames = [...rule.cssRules];
      if (!frames.some((f) => hasColor(f.style.cssText))) continue;
      const body = frames.map((f) => `${f.keyText} { ${declsOf(f.style, { all: true }).normal.join('; ')} }`).join('\n');
      normal += `@keyframes ${rule.name} {\n${body}\n}\n`;
    }
  }
  return { normal, important };
}

/** Bir stil dosyasının (ve içe aktardıklarının) kurallarını katmanına göre toplar. */
function collect(sheet, layer, out) {
  let rules;
  try { rules = sheet.cssRules; } catch { return; }
  const own = [];
  for (const rule of rules) {
    if (rule instanceof CSSImportRule) {
      const name = rule.layerName ?? layer;
      if (SKIP_LAYERS.has(name) || !rule.styleSheet) continue;
      collect(rule.styleSheet, name, out);
    } else own.push(rule);
  }
  if (own.length) out.push({ href: sheet.href ?? document.baseURI, layer, rules: own });
}

function buildSheets() {
  const groups = [];
  for (const sheet of document.styleSheets) {
    if (sheet.ownerNode?.dataset?.lightCopy) continue;
    collect(sheet, null, groups);
  }
  const sheets = [];
  for (const { href, layer, rules } of groups) {
    const { normal, important } = convertRules(rules);
    // Katmansız kaynak (JS'in eklediği <style>) katmansız kopyalanır: sonra
    // geldiği için aynı seçicide o kazanır.
    const wrap = (text, name) => (name ? `@layer ${name} {\n${text}}\n` : text);
    let text = '';
    if (normal) text += wrap(normal, layer ? LAYER_OF[layer] ?? `light-${layer}` : null);
    if (important) text += wrap(important, layer ? IMPORTANT_LAYER_OF[layer] ?? `light-imp-${layer}` : null);
    if (!text) continue;
    const sheet = new CSSStyleSheet({ baseURL: href });
    sheet.replaceSync(text);
    sheets.push(sheet);
  }
  return sheets;
}

// --- Uygulama ---------------------------------------------------------------

let current = 'dark';
let copies = [];
let observer = null;
let rebuildTimer = 0;
const listeners = new Set();

function adopt(sheets) {
  const others = document.adoptedStyleSheets.filter((s) => !copies.includes(s));
  copies = sheets;
  document.adoptedStyleSheets = [...others, ...sheets];
}

/** Sonradan eklenen <style> (ör. grafik stili menüsü) da çevrilsin. */
function watchHead() {
  if (observer) return;
  observer = new MutationObserver((records) => {
    if (current !== 'light') return;
    if (!records.some((r) => [...r.addedNodes].some((n) => n.nodeName === 'STYLE' || n.nodeName === 'LINK'))) return;
    clearTimeout(rebuildTimer);
    rebuildTimer = setTimeout(() => adopt(buildSheets()), 60);
  });
  observer.observe(document.head, { childList: true });
}

export function currentTheme() { return current; }

export function onThemeChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

/**
 * Temayı uygular ve hatırlar. Tuval tarafı (render) DOM'a bakmaz; haritanın
 * üstündeki levhalar CSS'ten gelir, o yüzden tuval önbelleği bozulmaz.
 */
export function setTheme(name, { persist = true } = {}) {
  const next = THEMES.includes(name) ? name : 'dark';
  current = next;
  document.documentElement.dataset.uiTheme = next;
  if (next === 'light') {
    const t0 = performance.now();
    adopt(buildSheets());
    watchHead();
    setTheme.lastBuildMs = performance.now() - t0;
  } else {
    adopt([]);
  }
  if (persist) {
    try { localStorage.setItem(KEY, next); } catch { /* özel pencere: yalnız bu oturum */ }
  }
  for (const fn of listeners) fn(next);
  return next;
}

/** Açılışta kayıtlı tema; ?theme=light|dark denetim için kaydı ezmeden zorlar. */
export function initTheme() {
  const forced = new URLSearchParams(location.search).get('theme');
  let stored = null;
  try { stored = localStorage.getItem(KEY); } catch { /* yok */ }
  const theme = setTheme(forced ?? stored ?? 'dark', { persist: !forced });
  // İçe aktarılan bir stil dosyası henüz yüklenmemişse kopyası eksik kalır:
  // sayfa tam yüklenince bir kez daha kur.
  if (document.readyState !== 'complete') {
    addEventListener('load', () => { if (current === 'light') adopt(buildSheets()); }, { once: true });
  }
  return theme;
}

/** Settings paneline "appearance" satırı: iki düğme, seçili olan yanar. */
export function mountThemeSettings() {
  const panel = document.getElementById('settings');
  if (!panel || panel.querySelector('.theme-settings')) return;
  const row = document.createElement('div');
  row.className = 'action-row theme-settings';
  row.style.marginTop = '14px';
  const k = document.createElement('div');
  k.className = 'k';
  k.textContent = 'appearance';
  row.append(k);
  const buttons = THEMES.map((name) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'action';
    b.dataset.theme = name;
    b.textContent = LABEL[name];
    b.addEventListener('click', () => setTheme(name));
    row.append(b);
    return b;
  });
  const sync = () => buttons.forEach((b) => {
    const on = b.dataset.theme === current;
    b.classList.toggle('on', on);
    b.setAttribute('aria-pressed', String(on));
  });
  onThemeChange(sync);
  sync();
  // Görüntü ayarlarının (grafik stili) hemen altına; yoksa ses satırlarından önce.
  const gfx = panel.querySelector('.gfx-settings');
  if (gfx) gfx.after(row);
  else panel.insertBefore(row, panel.querySelector('.amb-settings, .ui-sound-settings') ?? document.getElementById('save-info'));
}
