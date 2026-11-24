// Boşta akıcılık ölçüsü (Kerem 2026-11-25: "hiçbir şey olmasa bile akıcılık az").
//
//   node scripts/ui/hx.mjs --plan scripts/ui/idle-smooth.plan.mjs --no-boot --gpu --w 1536 --h 864 \
//     --port 9501 --server http://127.0.0.1:41910 --seed IDLE1 --out .shots/akicilik --query tag=once
//
// Oyunun ÇİZDİĞİ kare temposu ölçülür (game.frame çağrıları), rAF değil: duraklatılmış haritada
// deniz, bulut, gemi ve duman yalnız oyun kare çizdiğinde ilerler; tempo 30 Hz'de kalırsa ya da
// aralıklar düzensizse göz bunu takılma diye okur. Durumlar: duraklatılmış yakın/uzak, 1x akış,
// duraklatılmışken sürükleme ve tekerlek. Ayrıca künye bayrağının kare temposu (flagWave).
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const START = `(() => {
  const rec = window.__idle = { frames: [], dur: [], water: 0, full: 0, long: [], flag: [], on: true, vs: [] };
  const vs = (ts) => { if (!rec.on) return; rec.vs.push(ts); requestAnimationFrame(vs); };
  requestAnimationFrame(vs);
  const inner = game.frame;
  rec.restore = () => { game.frame = inner; };
  game.frame = (ts) => {
    const wasWater = game.waterPending && !game.dirty;
    const t0 = performance.now();
    inner(ts);
    rec.frames.push(t0); rec.dur.push(performance.now() - t0);
    if (wasWater) rec.water++; else rec.full++;
  };
  // Künye bayrağı tuvaline her çizimde dokunulur: boyut değişmez, tek ölçü zaman damgasıdır.
  const c = document.querySelector('#top-flag canvas, .nt-flag canvas, .top-flag canvas');
  if (c) {
    const ctx = c.getContext('2d');
    const draw = ctx.drawImage.bind(ctx);
    let last = -1;
    rec.flagRestore = () => { ctx.drawImage = draw; };
    ctx.drawImage = (...a) => { const t = performance.now(); if (t - last > 2) rec.flag.push(t); last = t; return draw(...a); };
  }
  try {
    const po = new PerformanceObserver((l) => { for (const e of l.getEntries()) rec.long.push(+e.duration.toFixed(1)); });
    po.observe({ type: 'longtask', buffered: false });
    rec.po = po;
  } catch {}
  return !!c;
})()`;

const STOP = `(() => {
  const rec = window.__idle; rec.on = false; rec.restore(); rec.flagRestore?.(); rec.po?.disconnect();
  const gaps = (t) => { const g = []; for (let i = 1; i < t.length; i++) g.push(t[i] - t[i - 1]); return g; };
  const stats = (arr) => {
    const v = arr.slice().sort((a, b) => a - b);
    if (!v.length) return null;
    const p = (q) => +v[Math.min(v.length - 1, Math.floor(q * v.length))].toFixed(1);
    const avg = v.reduce((s, x) => s + x, 0) / v.length;
    const sd = Math.sqrt(v.reduce((s, x) => s + (x - avg) ** 2, 0) / v.length);
    return { n: v.length, avg: +avg.toFixed(1), sd: +sd.toFixed(1), p50: p(0.5), p95: p(0.95), p99: p(0.99), max: +v[v.length - 1].toFixed(1) };
  };
  const span = (rec.vs[rec.vs.length - 1] - rec.vs[0]) / 1000;
  const fg = gaps(rec.frames);
  return {
    seconds: +span.toFixed(1),
    vsyncHz: +(rec.vs.length / span).toFixed(0),
    gameFps: +(rec.frames.length / span).toFixed(1),
    frameGap: stats(fg), gapsOver40: fg.filter((g) => g > 40).length,
    frameCost: stats(rec.dur), waterOnly: rec.water, full: rec.full,
    flagFps: +(rec.flag.length / span).toFixed(1), flagGap: stats(gaps(rec.flag)),
    longTasks: { n: rec.long.length, max: Math.max(0, ...rec.long) },
    zoom: +game.camera.zoom.toFixed(2), speed: game.clock.speed,
    gpu: { water: game.renderer.waterGL?.timer?.ema ?? null, living: game.living?.gl?.timer?.ema ?? null },
    livingCpu: +(game.living?.cpuMs ?? 0).toFixed(2),
  };
})()`;

export default async function plan(hx) {
  const argv = process.argv.join(' ');
  const tag = /tag=([\w-]+)/.exec(argv)?.[1] ?? 'x';
  const SERVER = process.argv[process.argv.indexOf('--server') + 1];
  const extra = /--query (\S+)/.exec(argv)?.[1] ?? '';
  const SEC = Number(/sec=(\d+)/.exec(argv)?.[1] ?? 8);
  await hx.send('Emulation.setDeviceMetricsOverride', { width: hx.W, height: hx.H, deviceScaleFactor: 1.25, mobile: false });
  await hx.send('Page.navigate', { url: `${SERVER}/?seed=${encodeURIComponent(hx.SEED)}&${extra}` });
  await hx.waitFor('window.game && game.world && document.querySelector("#nation-picker")', 90000);
  await hx.sleep(300);
  await hx.ev(`(() => { const b = document.querySelector('#nation-picker [data-play]'); if (b) b.click(); })()`);
  await hx.waitFor('!document.body.classList.contains("picker-open")', 10000).catch(() => {});
  await hx.sleep(4000);
  const out = { tag };
  const cx = hx.W / 2; const cy = hx.H / 2;
  const cap = await hx.ev('(() => { const n = game.world.nations[game.turns.playerNation]; return { x: n.capital.x, y: n.capital.y }; })()');
  const at = async (zoom) => {
    await hx.ev(`(() => { game.setSpeed(0); game.camera.zoom = ${zoom}; game.camera.centerOn(${cap.x}, ${cap.y}); game.requestRender(); })()`);
    await hx.sleep(2500);
  };
  const still = async (name, zoom, speed = 0) => {
    await at(zoom);
    if (speed) { await hx.ev(`game.setSpeed(${speed})`); await hx.sleep(1500); }
    await hx.mouse('mouseMoved', cx + 300, cy + 200);
    await hx.ev(START);
    await hx.sleep(SEC * 1000);
    out[name] = await hx.ev(STOP);
    await hx.ev('game.setSpeed(0)');
  };
  await still('pausedNear', 1.2);
  await still('pausedMid', 0.7);
  await still('pausedFar', 0.38);
  await still('run1x', 0.7, 1);
  // Duraklatılmışken orta tuşla sürükleme.
  await at(0.9);
  await hx.ev(START);
  await hx.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: cx, y: cy, button: 'middle', buttons: 4, clickCount: 1 });
  let x = cx; let y = cy;
  for (let i = 0; i < 160; i++) {
    x += Math.cos(i / 20) * 6; y += Math.sin(i / 13) * 4;
    await hx.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'middle', buttons: 4 });
    await hx.sleep(14);
  }
  await hx.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'middle', buttons: 0, clickCount: 1 });
  await hx.sleep(1200);
  out.pan = await hx.ev(STOP);
  // Tekerlek.
  await at(0.9);
  await hx.mouse('mouseMoved', cx, cy);
  await hx.ev(START);
  for (const [dy, n, gap] of [[-100, 10, 45], [100, 16, 45], [-100, 8, 60]]) {
    for (let i = 0; i < n; i++) {
      await hx.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: cx, y: cy, deltaX: 0, deltaY: dy });
      await hx.sleep(gap);
    }
  }
  await hx.sleep(1500);
  out.wheel = await hx.ev(STOP);
  writeFileSync(join(hx.OUT, `${tag}-idle.json`), JSON.stringify(out, null, 1));
  return out;
}
