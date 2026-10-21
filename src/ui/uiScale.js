// ARAYÜZ ÖLÇEĞİ (LS-01). Bütün HUD, ekran, rıhtım, panel ve bilgi kartı
// TEK bir çarpanla büyür: 1080p'de 1.0, üstünde pencereyle orantılı
// (1440p ~1.33, 2160p 2.0), altında hiçbir zaman 1.0'ın altına inmez.
//
// Neden CSS `zoom` ve neden arayüz köklerinde: tarayıcı yakınlaştırması gibi
// metni yeniden dizer (bulanık büyütme değil), ve harita tuvallerine
// dokunmaz — haritanın isabet sınaması (imleç → hex) birebir kalır.
// styles.css §0: `body > :not(canvas, .map-film) { zoom: var(--ui) }`.
//
// Standart CSS zoom'un iki sonucu, konum YAZAN her kod bunları bilmeli:
//   1. getBoundingClientRect, elementFromPoint ve olay clientX/Y GÖRSEL px'tir
//      (birbiriyle tutarlı; isabet ve sürükleme ölçüleri değişmez).
//   2. Yakınlaştırılmış öğeye yazılan left/top/max-height YEREL px'tir ve
//      çarpanla büyür. Dikdörtgenden ya da imleçten hesaplanan konum yazılmadan
//      önce `toLocal` / `localRect` / `viewport` ile yerel px'e çevrilir.
// Aynı nedenle CSS'te yakınlaştırılmış öğelerin vw/vh'si de çarpanla büyür:
// stil dosyası onları `/ var(--ui)` ile böler (sanal pencere = pencere / ölçek).

const BASE_W = 1920;
const BASE_H = 1080;
// 2.0: 3840x2160 tam olarak 1080p düzenine iner. Üstü (5K, 8K) aynı düzeni
// daha da büyütmek yerine ekranı geniş kullanır.
const MAX_SCALE = 2;

let scale = 1;
const listeners = new Set();

/**
 * Pencere ölçüsünden çarpan. Hem en hem boy oranının küçüğü: sanal pencere
 * hiçbir zaman 1920x1080'den dar ya da alçak olmaz (3440x1440 ultra geniş
 * 1.33 alır, 1920x1200 1.0 kalır). Yüzde bire yuvarlanır (aşağı): küçük
 * pencere oynamaları düzeni kıpırdatmasın.
 */
export function computeUiScale(width, height) {
  if (!(width > 0) || !(height > 0)) return 1;
  const raw = Math.min(height / BASE_H, width / BASE_W);
  return Math.max(1, Math.min(MAX_SCALE, Math.floor(raw * 100) / 100));
}

/** Geçerli çarpan (1 = 1080p). */
export function uiScale() {
  return scale;
}

/** Görsel (pencere) px → yakınlaştırılmış arayüz kökünün yerel px'i. */
export function toLocal(px) {
  return px / scale;
}

/** getBoundingClientRect'in yerel px karşılığı: konum yazan kod bunu okur. */
export function localRect(element) {
  const r = element.getBoundingClientRect();
  const s = scale;
  return {
    left: r.left / s, top: r.top / s, right: r.right / s, bottom: r.bottom / s,
    width: r.width / s, height: r.height / s, x: r.x / s, y: r.y / s,
  };
}

/** Sanal pencere: arayüzün gördüğü genişlik/yükseklik (yerel px). */
export function viewport() {
  const w = window.innerWidth || document.documentElement.clientWidth || BASE_W;
  const h = window.innerHeight || document.documentElement.clientHeight || BASE_H;
  return { w: w / scale, h: h / scale };
}

/** Çarpan değişince (pencere boyutu) çağrılır; yerleşim ölçen kod yeniden ölçer. */
export function onUiScale(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function apply() {
  // Elle sınama: ?ui=1.25 çarpanı sabitler (1080p makinede 1440p düzenini görmek için).
  const forced = Number(new URLSearchParams(location.search).get('ui'));
  const next = forced >= 1 && forced <= 3 ? forced : computeUiScale(window.innerWidth, window.innerHeight);
  if (next === scale && document.documentElement.style.getPropertyValue('--ui')) return;
  scale = next;
  document.documentElement.style.setProperty('--ui', String(next));
  document.documentElement.dataset.uiScale = String(next);
  for (const fn of listeners) fn(next);
}

// Modül yüklenir yüklenmez: ilk boyamadan önce doğru ölçekte kurulsun.
if (typeof window !== 'undefined') {
  apply();
  window.addEventListener('resize', apply);
}
