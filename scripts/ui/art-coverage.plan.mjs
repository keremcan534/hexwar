// RESİM KAPSAMI (2026-11-20, Kerem: "Paint'ten yapılmış gibi duran her şeyi ChatGPT'ye
// yaptıralım"). Her durumda görünen ikonları sayar: kodla çizilen (SVG glyph, satır içi
// SVG, emoji) ile resim (img, background-image). Hangi glyph'in kaç kez göründüğü de çıkar.
//   node scripts/ui/hx.mjs --plan scripts/ui/art-coverage.plan.mjs --gpu --w 1920 --h 1080
export default async function plan(hx) {
  const states = {};
  await hx.sleep(3500);
  const scan = () => hx.ev(`(() => {
    const shown = (el) => { if (!el.getClientRects().length) return false; const cs = getComputedStyle(el); return cs.visibility !== 'hidden' && Number(cs.opacity) > 0.05; };
    const r = (el) => el.getBoundingClientRect();
    const out = { glyphs: {}, svg: 0, img: 0, bg: 0, emoji: 0, svgWhere: {} };
    const P = window.__GLYPH_PATHS ?? {};
    for (const s of document.querySelectorAll('svg')) {
      if (!shown(s) || s.closest('#usability-marks')) continue;
      const b = r(s); if (b.width < 8 || b.width > 120) continue;
      out.svg++;
      const inner = s.innerHTML.replace(/\\s+/g, ' ').trim();
      const name = Object.keys(P).find((k) => P[k].replace(/\\s+/g, ' ').trim() === inner) ?? null;
      const host = s.parentElement?.closest('[class]');
      const where = host ? host.className.toString().trim().split(/\\s+/)[0] : '?';
      const key = name ?? ('svg@' + where);
      out.glyphs[key] = (out.glyphs[key] ?? 0) + 1;
    }
    for (const i of document.querySelectorAll('img')) if (shown(i) && r(i).width >= 10) out.img++;
    for (const e of document.querySelectorAll('body *')) {
      if (!shown(e)) continue;
      const bg = getComputedStyle(e).backgroundImage;
      if (bg && bg.includes('url(') && r(e).width >= 10 && r(e).width < 400) out.bg++;
    }
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const emo = /[\\u{1F300}-\\u{1FAFF}\\u{2600}-\\u{27BF}]/u;
    for (let n = walker.nextNode(); n; n = walker.nextNode()) if (emo.test(n.textContent) && n.parentElement && shown(n.parentElement)) out.emoji++;
    return out;
  })()`);
  await hx.ev(`(async () => { const m = await import('/src/ui/icons/glyphs.js'); const names = ${JSON.stringify([])}; window.__GLYPH_PATHS = {}; for (const k of ['swords','dove','scroll','medal','flag','column','crane','factory','flask','shield','ballot','warning','bread','wheat','skull','crown','info','gear','rail','anchor','cap','mask','crate','tools','horse','burst','map','bar','coin','pick','hourglass','advance','halt','close','menu','check','star','up','down','flat','plane','ship','compass','locate','home','reserve','pencil','diamond','dot','bell','people','laurel','handshake','scales']) { const d = document.createElement('div'); d.innerHTML = m.glyph(k); window.__GLYPH_PATHS[k] = d.firstElementChild.innerHTML; } return 1; })()`);
  const closeAll = async () => { for (let i = 0; i < 3; i++) await hx.key('Escape'); await hx.sleep(300); };
  states.harita = await scan();
  for (const key of ['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10']) {
    await hx.key(key); await hx.sleep(1000);
    const name = await hx.ev(`document.querySelector('#screen:not(.hidden)')?.dataset.screen ?? '${key}'`);
    states[name] = await scan();
    await closeAll();
  }
  await hx.key('p'); await hx.sleep(1000); states.diplomacy = await scan(); await closeAll();
  await hx.ev(`game.emit('nation', game.world.nations.find((n) => n.alive && n.id !== game.turns.playerNation).id); 1`);
  await hx.sleep(1000); states.dossier = await scan(); await closeAll();
  await hx.key('m'); await hx.sleep(900); states.navy = await scan(); await closeAll();
  await hx.clickSel('#btn-settings'); await hx.sleep(600); states.settings = await scan(); await closeAll();
  return { states };
}
