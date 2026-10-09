// YERLEŞİM SONDASI (2026-10-09, Kerem: "genel bir UI simetri fixi; gösterilemeyen
// bir yer var mı"). Açık ekranda üç şeyi ölçer, window.__layoutProbe() döner:
//   1. ULAŞILAMAYAN İÇERİK: overflow:hidden/clip bir kabın içeriği kutusundan
//      büyükse oyuncu onu fareyle göremez (Politics'te Danışmanlar böyleydi).
//      Kasıtlı kırpmalar (… ile biten tek satırlık metin) ayrı sayılır.
//   2. TAŞMA: pencere dışına çıkan öğe; kesilen (…) metin sayısı.
//   3. SİMETRİ: yan yana sütunların alt kenar farkı, ekran gövdesinin sol/sağ
//      boşluk farkı, aynı satırdaki KPI kutularının yükseklik farkı.
(() => {
  const describe = (el) => {
    const id = el.id ? `#${el.id}` : '';
    const cls = typeof el.className === 'string' && el.className.trim()
      ? `.${el.className.trim().split(/\s+/).slice(0, 2).join('.')}` : '';
    return `${el.tagName.toLowerCase()}${id}${cls}`;
  };
  const visible = (el) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
  window.__layoutProbe = (root = document.querySelector('#screen:not(.hidden)') ?? document.body) => {
    const vw = innerWidth;
    const vh = innerHeight;
    const out = { unreachable: [], ellipsis: 0, ellipsisSamples: [], offscreen: [], columns: [], gutters: null, kpis: [] };
    for (const el of root.querySelectorAll('*')) {
      if (!visible(el)) continue;
      const cs = getComputedStyle(el);
      const hiddenY = cs.overflowY === 'hidden' || cs.overflowY === 'clip';
      const hiddenX = cs.overflowX === 'hidden' || cs.overflowX === 'clip';
      const oneLine = cs.whiteSpace === 'nowrap' && cs.textOverflow === 'ellipsis';
      if (oneLine && el.scrollWidth > el.clientWidth + 1) {
        out.ellipsis++;
        if (out.ellipsisSamples.length < 8) out.ellipsisSamples.push(`${describe(el)} "${el.textContent.trim().slice(0, 30)}"`);
        continue;
      }
      // Kasıtlı maskeler: ilerleme çubukları, yuvarlak madalyonlar, kaydırılan kaplar.
      if (el.clientHeight < 12 || el.clientWidth < 12) continue;
      if (/meter|bar|ring|art|flag|socket|pip|spark|chart|canvas|belt/i.test(el.className)) continue;
      const dy = hiddenY ? el.scrollHeight - el.clientHeight : 0;
      const dx = hiddenX ? el.scrollWidth - el.clientWidth : 0;
      if (dy > 4 || dx > 4) out.unreachable.push(`${describe(el)} hidden ${dx > 4 ? `${dx}px wide ` : ''}${dy > 4 ? `${dy}px tall` : ''}`);
      const r = el.getBoundingClientRect();
      if (r.width > 0 && (r.right > vw + 1 || r.bottom > vh + 1) && !el.closest('[style*="overflow"], .screen-body, .tech-tree, .k-states, .k-wtable, .mil-build-list, .mil-queue-list')) {
        if (out.offscreen.length < 8) out.offscreen.push(`${describe(el)} ${Math.round(r.right)}x${Math.round(r.bottom)}`);
      }
    }
    // Yan yana sütunlar: aynı ızgaranın doğrudan çocukları.
    for (const grid of root.querySelectorAll('.k-split, .k-cols-2, .k-cols-3, .mil-cols, .lcs, .k-kpis')) {
      const kids = [...grid.children].filter(visible).map((c) => c.getBoundingClientRect());
      if (kids.length < 2) continue;
      const tops = new Set(kids.map((r) => Math.round(r.top)));
      if (tops.size > 1 && !grid.classList.contains('k-kpis')) continue; // alt alta kırılmış
      const bottoms = kids.map((r) => r.bottom);
      const spread = Math.round(Math.max(...bottoms) - Math.min(...bottoms));
      const label = describe(grid);
      if (grid.classList.contains('k-kpis')) {
        const heights = kids.map((r) => r.height);
        const hs = Math.round(Math.max(...heights) - Math.min(...heights));
        if (hs > 1) out.kpis.push(`${label} heights differ ${hs}px`);
      } else if (spread > 8) {
        out.columns.push(`${label} bottoms differ ${spread}px`);
      }
    }
    const body = root.querySelector('.screen-body');
    if (body) {
      const b = body.getBoundingClientRect();
      const kids = [...body.children].filter(visible).map((c) => c.getBoundingClientRect());
      if (kids.length) {
        const left = Math.round(Math.min(...kids.map((r) => r.left)) - b.left);
        const right = Math.round(b.right - Math.max(...kids.map((r) => r.right)) - (body.offsetWidth - body.clientWidth));
        out.gutters = { left, right, diff: Math.abs(left - right) };
      }
      out.scroll = Math.max(0, body.scrollHeight - body.clientHeight);
    }
    return out;
  };
  return 'layout probe ready';
})();
