// Tarayıcı içi yakalama yardımcıları (window.CAP). Arayüzü gizler, kamerayı
// yerleştirir, sanal saati bir kare ilerletip haritayı çizdirir.

const CHROME_SELECTORS = [
  '#hud-header', '#notify-stack', '#map-modes', '#btn-layers', '#rgo-map-legend',
  '#population-map-legend', '#mode-legend', '#layer-menu', '#settings', '#divisions',
  '#command-dock', '#command-bar', '#sheet', '#screen', '#nation-picker', '#menu',
  '.alert-strip', '#alert-strip', '#tooltip', '.tooltip', '#perf',
];

let styleEl = null;
export function chrome(mode) {
  // mode: 'none' = yalnız harita, 'hud' = oyunun tam arayüzü
  styleEl ??= document.head.appendChild(document.createElement('style'));
  styleEl.textContent = mode === 'none'
    ? `${CHROME_SELECTORS.join(',')}{display:none!important} #map-film{opacity:0!important} *{cursor:none!important}`
    : `#notify-stack,.alert-strip,#alert-strip,#tooltip,.tooltip{display:none!important} *{cursor:none!important}`;
}

export function startClock() { if (!window.__clock.on) window.__clock.start(); }

export function camera(x, y, zoom) {
  const c = game.camera;
  c.zoom = Math.max(c.minZoom, Math.min(c.maxZoom, zoom));
  c.centerOn(x, y);
}

// Bir kare: saati ilerlet, bekleyen rAF'leri çalıştır, haritayı zorla çiz.
export function tick(ms = 1000 / 60) {
  window.__clock.step(ms);
  game.dirty = true;
  game.frameHandle = 0;
  game.frame(performance.now());
}

export function mapMode(m) {
  const btn = document.querySelector(`.mode-btn[data-mode="${m}"]`);
  if (btn) btn.click(); else game.renderer.setMapMode(m);
  game.renderer.invalidateCache();
}

export function layers({ grid, country, province, labels } = {}) {
  const r = game.renderer;
  if (grid !== undefined) r.showGrid = grid;
  if (country !== undefined) r.showCountryBorders = country;
  if (province !== undefined) r.showProvinceBorders = province;
  if (labels !== undefined) r.showLabels = labels;
  r.invalidateCache();
}

// Bir ekran öğesinin dikdörtgeni (kompozitör odak maskesi için).
export function rect(sel) {
  const el = typeof sel === 'string' ? document.querySelector(sel) : sel;
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.x, y: r.y, w: r.width, h: r.height };
}

export function rectByText(text, root = document.body, tag = '*') {
  const all = [...root.querySelectorAll(tag)].filter((e) => e.children.length === 0 && e.textContent.trim() === text && e.offsetParent);
  return all.length ? rect(all[0]) : null;
}

export function worldToScreen(x, y) { return game.camera.worldToScreen(x, y); }

export function tileCenter(q, r) { const t = game.world.get(q, r); return t ? { x: t.x, y: t.y } : null; }

export function provinceCenter(id) {
  const p = game.world.provinces[id];
  let x = 0, y = 0;
  for (const i of p.tileIdx) { x += game.world.tiles[i].x; y += game.world.tiles[i].y; }
  return { x: x / p.tileIdx.length, y: y / p.tileIdx.length };
}

export function nationCenter(id) {
  let x = 0, y = 0, n = 0;
  for (const t of game.world.tiles) if (t.owner === id) { x += t.x; y += t.y; n++; }
  return { x: x / n, y: y / n };
}
