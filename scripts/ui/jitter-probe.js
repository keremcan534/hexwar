// ARAYÜZ OYNAMA SONDASI (Kerem 2026-10-08: "oyun ilerlerken arayüz oynuyor,
// hiçbir koşulda olmayacak"). Sayfaya enjekte edilir (DevTools konsolu ya da
// başsız CDP), oyun hızlı akarken üç şeyi sayar: layout-shift kaynakları,
// gizle/göster geçişleri, izlenen kapların konum/boyut değişimi. Sonuç:
// window.__jitDump(). Hedef: 8x'te 40 sn boyunca shifts/toggles/moves BOŞ
// (yalnız ekran açılış hareketi ve savaşın başlaması gibi tek seferlik olaylar).
(() => {
  const describe = (node) => {
    if (!node || node.nodeType !== 1) return node?.nodeName ?? '?';
    const id = node.id ? `#${node.id}` : '';
    const cls = typeof node.className === 'string' && node.className
      ? `.${node.className.trim().split(/\s+/).slice(0, 3).join('.')}` : '';
    return `${node.tagName.toLowerCase()}${id}${cls}`;
  };
  const path = (node) => {
    const parts = [];
    let n = node;
    for (let i = 0; n && n.nodeType === 1 && i < 4; i++, n = n.parentElement) parts.unshift(describe(n));
    return parts.join(' > ');
  };
  const J = window.__jit = { shifts: {}, shiftScore: 0, toggles: {}, moves: {}, samples: 0 };
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      if (entry.hadRecentInput) continue;
      J.shiftScore += entry.value;
      for (const src of entry.sources ?? []) {
        const key = path(src.node);
        const row = J.shifts[key] ??= { n: 0, dx: 0, dy: 0, dw: 0, dh: 0 };
        row.n++;
        row.dx += Math.abs(src.currentRect.x - src.previousRect.x);
        row.dy += Math.abs(src.currentRect.y - src.previousRect.y);
        row.dw += Math.abs(src.currentRect.width - src.previousRect.width);
        row.dh += Math.abs(src.currentRect.height - src.previousRect.height);
      }
    }
  }).observe({ type: 'layout-shift', buffered: false });

  // Gizle/göster: hidden özniteliği, hidden/open/collapsed sınıfları, display.
  const vis = new WeakMap();
  const visible = (el) => !el.hidden && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
  new MutationObserver((records) => {
    for (const r of records) {
      const el = r.target;
      if (el.nodeType !== 1) continue;
      const now = visible(el);
      const before = vis.get(el);
      vis.set(el, now);
      if (before !== undefined && before !== now) {
        const key = path(el);
        J.toggles[key] = (J.toggles[key] ?? 0) + 1;
      }
    }
  }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['hidden', 'class', 'style', 'aria-hidden'] });

  // İzlenen kaplar: her 100 ms konum/boyut.
  const WATCH = ['#hud-header', '.topbar', '.top-stats', '.tb-cartouche', '.tb-minis', '.tb-res', '.turn-control',
    '.nation-badge', '#tab-bar', '.sheet', '#movement-dock', '.movement-dock', '.notify-tray', '#notifications',
    '.command-bar', '#command-bar', '#divisions', '.screen', '.minimap', '.map-modes', '.toast', '.event-card'];
  const last = {};
  setInterval(() => {
    J.samples++;
    for (const sel of WATCH) {
      const el = document.querySelector(sel);
      const r = el && el.getClientRects().length ? el.getBoundingClientRect() : null;
      const sig = r ? `${Math.round(r.x)},${Math.round(r.y)},${Math.round(r.width)},${Math.round(r.height)}` : 'none';
      if (last[sel] !== undefined && last[sel] !== sig) {
        const row = J.moves[sel] ??= { n: 0, seen: new Set() };
        row.n++;
        if (row.seen.size < 6) row.seen.add(sig);
      }
      last[sel] = sig;
    }
  }, 100);
  window.__jitDump = () => ({
    shiftScore: +J.shiftScore.toFixed(3),
    samples: J.samples,
    shifts: Object.entries(J.shifts).sort((a, b) => b[1].n - a[1].n).slice(0, 15)
      .map(([k, v]) => `${v.n}x dx${Math.round(v.dx)} dy${Math.round(v.dy)} dw${Math.round(v.dw)} dh${Math.round(v.dh)}  ${k}`),
    toggles: Object.entries(J.toggles).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([k, v]) => `${v}x  ${k}`),
    moves: Object.entries(J.moves).map(([k, v]) => `${v.n}x ${k}  [${[...v.seen].join(' | ')}]`),
  });
  return 'probe on';
})();
