// KULLANILABİLİRLİK SONDASI (2026-11-19, Kerem: "bazı panellerde aşağı kaydırmam
// gerekiyor, bazı paneller bir şeylerin önünü kapatıyor, boşluklar var, uzun uzun
// açıklama var"). layout-probe "çizildi mi, taştı mı"ya bakar; bu sonda oyuncunun
// gördüğünü ölçer. window.__usabilityProbe() açık durumdaki ekranı tarar:
//   1. ÖRTÜLEN DENETİM: düğmenin ortasına tıklanınca başka bir öğe tıklanıyorsa.
//   2. ÖRTÜŞEN PANEL: iki yüzer yüzey üst üste biniyorsa (tam ekran pencere hariç).
//   3. KAYDIRMA: içeriği kutusuna sığmayan kap; gizli kalan boy ve oranı.
//   4. BOŞLUK: kartın içinde içeriksiz büyük bant ya da dipte boş kalan alan.
//   5. UZUN METİN: tek blokta 28 kelimeyi aşan açıklama.
//   6. KÜÇÜK HEDEF: 24 pikselden küçük tıklanan öğe.
(() => {
  const describe = (el) => {
    if (!el) return 'null';
    const id = el.id ? `#${el.id}` : '';
    const cls = typeof el.className === 'string' && el.className.trim()
      ? `.${el.className.trim().split(/\s+/).slice(0, 2).join('.')}` : '';
    return `${el.tagName.toLowerCase()}${id}${cls}`;
  };
  const shown = (el) => {
    if (!el.getClientRects().length) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== 'hidden' && Number(cs.opacity) > 0.05;
  };
  const isMap = (el) => el.tagName === 'CANVAS' && /^map/.test(el.id);
  const label = (el) => (el.getAttribute('aria-label') || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40);
  const rectOf = (el) => {
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) };
  };

  /** Açık tam ekran pencere (yönetim ekranı, ayarlar, gazete): altındaki HUD bilerek örtülür. */
  const modalRoot = () => {
    const vw = innerWidth;
    const vh = innerHeight;
    for (const sel of ['#screen:not(.hidden)', '#settings:not(.hidden)', '[role=dialog]:not(.hidden)', '[aria-modal=true]', '.np-modal:not(.hidden)', '#menu:not(.hidden)']) {
      const el = document.querySelector(sel);
      if (el && shown(el)) {
        const r = el.getBoundingClientRect();
        if (r.width * r.height > vw * vh * 0.25) return el;
      }
    }
    return null;
  };

  /** Yüzer yüzeyler: haritanın üstünde duran, başka bir yüzeyin içinde olmayan kutular. */
  const surfaces = () => {
    const list = [];
    for (const el of document.body.querySelectorAll('*')) {
      if (isMap(el) || !shown(el)) continue;
      const cs = getComputedStyle(el);
      if (cs.position !== 'fixed' && cs.position !== 'absolute') continue;
      if (cs.pointerEvents === 'none') continue;
      const r = el.getBoundingClientRect();
      if (r.width * r.height < 3000 || r.width >= innerWidth - 2 && r.height >= innerHeight - 2) continue;
      if (/tooltip|tip-|toast/i.test(el.className) || el.id === 'tooltip') continue;
      list.push(el);
    }
    // Yalnız en dış yüzeyler: bir kartın kendi iç katmanları (portre, künye) örtüşme sayılmaz.
    return list.filter((el) => !list.some((o) => o !== el && o.contains(el)) && !el.parentElement?.closest('[class*="card"], [class*="dock"], [class*="panel"], [class*="cmd-"]'));
  };

  window.__usabilityProbe = () => {
    const vw = innerWidth;
    const vh = innerHeight;
    const modal = modalRoot();
    const scope = modal ?? document.body;
    const out = { view: [vw, vh], modal: modal ? describe(modal) : null, covered: [], overlaps: [], scroll: [], gaps: [], verbose: [], small: [] };

    // 1. Örtülen denetim: ortası ve iki köşeye yakın nokta.
    const controls = scope.querySelectorAll('button, a[href], input:not([type=hidden]), select, [role=button], [role=tab], .tab, [data-tip]');
    for (const el of controls) {
      if (!shown(el) || el.closest('[aria-hidden="true"]')) continue;
      // Kesik biçimli denetim (hız kadranı dilimi) kutusunun her yerinde tıklanmaz.
      if (getComputedStyle(el).clipPath !== 'none') continue;
      const r = el.getBoundingClientRect();
      if (r.width < 4 || r.height < 4 || r.right < 0 || r.bottom < 0 || r.left > vw || r.top > vh) continue;
      // Kaydırılan kabın dışında kalan denetim kaydırma bulgusudur, örtü değil.
      let clipped = false;
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        const cs = getComputedStyle(p);
        if (/(auto|scroll|hidden|clip)/.test(cs.overflowY + cs.overflowX)) {
          const pr = p.getBoundingClientRect();
          if (r.top < pr.top - 1 || r.bottom > pr.bottom + 1 || r.left < pr.left - 1 || r.right > pr.right + 1) { clipped = true; break; }
        }
      }
      if (clipped) continue;
      const pts = [[r.left + r.width / 2, r.top + r.height / 2], [r.left + r.width * 0.2, r.top + r.height * 0.5], [r.left + r.width * 0.8, r.top + r.height * 0.5]];
      let blocked = 0;
      let by = null;
      for (const [x, y] of pts) {
        const top = document.elementFromPoint(x, y);
        if (!top || el.contains(top) || top.contains(el)) continue;
        blocked++;
        by = top;
      }
      if (blocked >= 2) out.covered.push({ el: describe(el), text: label(el), rect: rectOf(el), by: describe(by) });
    }

    // 2. Örtüşen yüzeyler (yalnız harita görünümünde: pencere açıkken altı bilerek örtülür).
    if (!modal) {
      const list = surfaces();
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          const a = list[i].getBoundingClientRect();
          const b = list[j].getBoundingClientRect();
          const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
          const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
          if (w < 6 || h < 6) continue;
          const area = w * h;
          const small = Math.min(a.width * a.height, b.width * b.height);
          if (area < 300 || area < small * 0.04) continue;
          const cx = Math.max(a.left, b.left) + w / 2;
          const cy = Math.max(a.top, b.top) + h / 2;
          const top = document.elementFromPoint(cx, cy);
          const upper = list[i].contains(top) ? list[i] : list[j].contains(top) ? list[j] : null;
          const lower = upper === list[i] ? list[j] : list[i];
          out.overlaps.push({ top: describe(upper ?? list[i]), under: describe(lower), share: Math.round((area / small) * 100), rect: { x: Math.round(Math.max(a.left, b.left)), y: Math.round(Math.max(a.top, b.top)), w: Math.round(w), h: Math.round(h) } });
        }
      }
    }

    // 3. Kaydırma isteyen kaplar.
    for (const el of scope.querySelectorAll('*')) {
      if (!shown(el)) continue;
      const cs = getComputedStyle(el);
      if (!/(auto|scroll)/.test(cs.overflowY)) continue;
      const hidden = el.scrollHeight - el.clientHeight;
      if (hidden < 12 || el.clientHeight < 40) continue;
      out.scroll.push({ el: describe(el), hiddenPx: hidden, visiblePx: el.clientHeight, hiddenShare: Math.round((hidden / el.scrollHeight) * 100), rect: rectOf(el) });
    }

    // 4. Boşluk: kart içinde içeriksiz bant ya da dipte boş alan.
    for (const el of scope.querySelectorAll('section, article, .panel, .card, [class*="card"], [class*="panel"], [class*="dock"], [class*="sheet"], .k-sec, .screen-body > *')) {
      if (!shown(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 160 || r.height < 120 || r.height > vh * 0.95) continue;
      const cs = getComputedStyle(el);
      if (/(auto|scroll)/.test(cs.overflowY)) continue;
      const kids = [...el.children].filter((k) => shown(k) && getComputedStyle(k).position !== 'absolute').map((k) => k.getBoundingClientRect()).filter((k) => k.height > 0).sort((p, q) => p.top - q.top);
      if (kids.length < 1) continue;
      let gapMax = 0;
      let gapAt = 0;
      let bottom = kids[0].bottom;
      for (const k of kids.slice(1)) {
        if (k.top - bottom > gapMax) { gapMax = k.top - bottom; gapAt = bottom; }
        bottom = Math.max(bottom, k.bottom);
      }
      const tail = r.bottom - parseFloat(cs.paddingBottom) - bottom;
      if (gapMax > 44) out.gaps.push({ el: describe(el), kind: 'band', px: Math.round(gapMax), rect: { x: Math.round(r.left), y: Math.round(gapAt), w: Math.round(r.width), h: Math.round(gapMax) } });
      if (tail > 60 && tail > r.height * 0.22) out.gaps.push({ el: describe(el), kind: 'tail', px: Math.round(tail), rect: { x: Math.round(r.left), y: Math.round(bottom), w: Math.round(r.width), h: Math.round(tail) } });
    }

    // 5. Uzun metin blokları (bilgi kartları hariç: onlar istekle açılır).
    for (const el of scope.querySelectorAll('p, small, li, span, div, em, i')) {
      if (!shown(el) || el.closest('#tooltip, .tooltip')) continue;
      const own = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join(' ').trim();
      const words = own.split(/\s+/).filter(Boolean).length;
      if (words > 28) out.verbose.push({ el: describe(el), words, text: own.slice(0, 70), rect: rectOf(el) });
    }

    // 6. Küçük tıklama hedefleri.
    for (const el of scope.querySelectorAll('button, [role=button], [role=tab], a[href], input[type=checkbox], input[type=radio], select')) {
      if (!shown(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) continue;
      if (Math.min(r.width, r.height) < 24) out.small.push({ el: describe(el), text: label(el), size: `${Math.round(r.width)}x${Math.round(r.height)}`, rect: rectOf(el) });
    }
    return out;
  };

  /** Bulguları ekranda renkli çerçeveyle işaretler (rapor görüntüsü için). */
  window.__usabilityMark = (report) => {
    window.__usabilityUnmark();
    const layer = document.createElement('div');
    layer.id = 'usability-marks';
    layer.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483646';
    const box = (rect, color, text) => {
      if (!rect) return;
      const b = document.createElement('div');
      b.style.cssText = `position:fixed;left:${rect.x}px;top:${rect.y}px;width:${Math.max(4, rect.w)}px;height:${Math.max(4, rect.h)}px;outline:3px solid ${color};outline-offset:-1px;background:${color}22`;
      if (text) {
        const t = document.createElement('span');
        t.textContent = text;
        t.style.cssText = `position:absolute;left:0;top:-16px;font:700 11px/14px sans-serif;color:#fff;background:${color};padding:0 4px;white-space:nowrap`;
        b.appendChild(t);
      }
      layer.appendChild(b);
    };
    for (const f of report.covered) box(f.rect, '#ff2d55', 'örtülü');
    for (const f of report.overlaps) box(f.rect, '#ff8a00', `${f.share}% örtüşme`);
    for (const f of report.scroll) box(f.rect, '#00b7ff', `kaydır ${f.hiddenPx}px`);
    for (const f of report.gaps) box(f.rect, '#b14dff', `boşluk ${f.px}px`);
    for (const f of report.verbose) box(f.rect, '#ffd60a', `${f.words} kelime`);
    document.body.appendChild(layer);
  };
  window.__usabilityUnmark = () => document.getElementById('usability-marks')?.remove();
  return 'usability probe ready';
})();
