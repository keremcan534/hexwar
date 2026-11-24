// Zoom ve kaydırma akıcılığı ölçüsü: gerçek tekerlek ve orta tuş sürüklemesi, Kerem'in ekranıyla.
//
//   PORT=5196 node scripts/dev-server.mjs &
//   node scripts/ui/hx.mjs --plan scripts/ui/zoom-pan-perf.plan.mjs --no-boot --gpu --w 1536 --h 864 \
//     --port 9346 --server http://localhost:5196 --seed PERF1 --out .shots/perf --query tag=once
//
// --no-boot ŞART: DPR (1.25) oyun açılmadan ayarlanır. Sahne aynı tohum ve aynı hafta sayısıyla
// her koşuda aynıdır (önce/sonra aynı kadraj). Ölçü üç kaynaktan:
//   - rAF aralığı (ekrana çıkan kare temposu; 16.7 ms'yi aşan = takılan kare),
//   - game.perf (oyunun kendi karesinin ana iş parçacığı süresi, bölümleriyle),
//   - CDP Profiler (hangi fonksiyon zaman yiyor) ve longtask gözlemcisi; GPU gpuTimer EMA'larından.
import { join } from 'node:path';
import { writeFileSync } from 'node:fs';

const RECORDER = `(() => {
  const rec = window.__rec = { t: [], long: [], frames: [], on: true }; game.turns.lastWorstStep = null; rec.week0 = game.world.turn;
  rec.z = []; const tick = (ts) => { if (!rec.on) return; rec.t.push(ts); rec.z.push(game.camera.zoom); requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
  try {
    const po = new PerformanceObserver((l) => { for (const e of l.getEntries()) rec.long.push(+e.duration.toFixed(1)); });
    po.observe({ type: 'longtask', buffered: false });
    rec.po = po;
  } catch {}
  // Oyunun kendi kare süresi (render + tur dilimi), kare başına.
  const frame = game.frame;
  rec.restore = () => { game.frame = frame; };
  game.frame = (ts) => { const t0 = performance.now(); frame(ts); rec.frames.push(performance.now() - t0); };
  game.perf?.reset();
  return true;
})()`;

const STOP = `(() => {
  const rec = window.__rec; rec.on = false; rec.po?.disconnect(); rec.restore();
  const gaps = []; for (let i = 1; i < rec.t.length; i++) gaps.push(rec.t[i] - rec.t[i - 1]);
  const stats = (arr) => {
    const v = arr.slice().sort((a, b) => a - b);
    if (!v.length) return null;
    const p = (q) => +v[Math.min(v.length - 1, Math.floor(q * v.length))].toFixed(2);
    return { n: v.length, avg: +(v.reduce((s, x) => s + x, 0) / v.length).toFixed(2), p50: p(0.5), p95: p(0.95), p99: p(0.99), max: +v[v.length - 1].toFixed(1) };
  };
  const r = game.renderer;
  const gpu = {};
  for (const [name, t] of [['surface', r.waterGL?.timer], ['living', game.living?.gl?.timer], ['warFx', r.warFx?.layer?.timer ?? r.warFx?.gl?.timer]]) {
    if (t) gpu[name] = { ema: t.ema == null ? null : +t.ema.toFixed(2), samples: t.samples };
  }
  const snap = game.perf?.snapshot();
  const sections = {};
  for (const [k, s] of Object.entries(snap?.sections ?? {})) sections[k] = { avg: +s.avg.toFixed(2), max: +s.max.toFixed(1) };
  return {
    rafGap: stats(gaps), bigGaps: gaps.map((g, i) => [+g.toFixed(0), +(rec.t[i] - rec.t[0]).toFixed(0), +rec.z[i].toFixed(2), +rec.z[i + 1].toFixed(2)]).filter((g) => g[0] > 40), over17: gaps.filter((g) => g > 17.5).length, over33: gaps.filter((g) => g > 34).length,
    gameFrame: stats(rec.frames), gameOver16: rec.frames.filter((f) => f > 16.7).length,
    longTasks: { n: rec.long.length, sum: +rec.long.reduce((s, x) => s + x, 0).toFixed(0), max: Math.max(0, ...rec.long) },
    sections, gpu, zoom: +game.camera.zoom.toFixed(3), worstStep: game.turns.lastWorstStep, weeks: game.world.turn - rec.week0,
  };
})()`;

/** Profilin fonksiyon başına öz süresi (ms), en büyük N. */
function topSelf(profile, n = 25) {
  const byId = new Map(profile.nodes.map((node) => [node.id, node]));
  const self = new Map();
  const dts = profile.timeDeltas;
  for (let i = 0; i < profile.samples.length; i++) {
    const node = byId.get(profile.samples[i]);
    const cf = node.callFrame;
    const url = cf.url.replace(/^.*?\/src\//, 'src/').replace(/^https?:\/\/[^/]+\//, '');
    const key = `${cf.functionName || '(anon)'} ${url}:${cf.lineNumber + 1}`;
    self.set(key, (self.get(key) ?? 0) + (dts[i] ?? 0) / 1000);
  }
  const total = [...self.values()].reduce((s, v) => s + v, 0);
  return { totalMs: +total.toFixed(0), top: [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => [k, +v.toFixed(1)]) };
}

/** Toplam (kapsayıcı) süre: fonksiyon yığında herhangi bir yerdeyse sayılır. */
function topTotal(profile, match, n = 30) {
  const byId = new Map(profile.nodes.map((node) => [node.id, node]));
  const parent = new Map();
  for (const node of profile.nodes) for (const c of node.children ?? []) parent.set(c, node.id);
  const tot = new Map();
  const dts = profile.timeDeltas;
  for (let i = 0; i < profile.samples.length; i++) {
    const seen = new Set();
    let id = profile.samples[i];
    while (id != null) {
      const cf = byId.get(id).callFrame;
      const url = cf.url.replace(/^.*?\/src\//, 'src/');
      if (url.includes(match)) {
        const key = `${cf.functionName || '(anon)'} ${url}:${cf.lineNumber + 1}`;
        if (!seen.has(key)) { seen.add(key); tot.set(key, (tot.get(key) ?? 0) + (dts[i] ?? 0) / 1000); }
      }
      id = parent.get(id);
    }
  }
  return [...tot.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => [k, +v.toFixed(1)]);
}

export default async function plan(hx) {
  const argv = process.argv.join(' ');
  const tag = /tag=([\w-]+)/.exec(argv)?.[1] ?? 'x';
  const weeksN = Number(/weeks=(\d+)/.exec(argv)?.[1] ?? 260);
  const SERVER = process.argv[process.argv.indexOf('--server') + 1];
  const extra = /--query (\S+)/.exec(argv)?.[1] ?? '';
  await hx.send('Emulation.setDeviceMetricsOverride', { width: hx.W, height: hx.H, deviceScaleFactor: 1.25, mobile: false });
  await hx.send('Page.navigate', { url: `${SERVER}/?seed=${encodeURIComponent(hx.SEED)}&${extra}` });
  await hx.waitFor('window.game && game.world && document.querySelector("#nation-picker")', 90000);
  await hx.sleep(300);
  await hx.ev(`(() => { const b = document.querySelector('#nation-picker [data-play]'); if (b) b.click(); })()`);
  await hx.waitFor('!document.body.classList.contains("picker-open")', 10000).catch(() => {});
  await hx.sleep(800);
  const out = { tag, dpr: await hx.ev('game.renderer.dpr'), size: await hx.ev('[game.world.width, game.world.height]') };
  // Kampanyayı ilerlet (senkron haftalar; 5 yıl).
  const t0 = Date.now();
  for (let done = 0; done < weeksN; done += 13) {
    await hx.ev(`(() => { for (let i = 0; i < ${Math.min(13, weeksN - done)}; i++) game.endTurn(); })()`);
  }
  out.advanceSec = (Date.now() - t0) / 1000;
  out.year = await hx.ev('game.world.turn');
  // Kalabalık cephe: oyuncu ile komşusu savaşta, yüzlerce tümen.
  await hx.inject(join(hx.probes, 'minis-scene.js'));
  out.scene = await hx.ev('__minisScene({ radius: 11, perTile: 3 })');
  out.war = await hx.ev(`(() => {
    const world = game.world; const me = game.turns.playerNation;
    const foes = new Set(world.units.filter((u) => u.nationId !== me).map((u) => u.nationId));
    let n = 0; for (const id of foes) { const rec = world.relations?.[me]?.[id]; if (rec && rec.state !== 'war') { rec.state = 'war'; n++; } }
    const wars = world.nations.filter((a) => a.alive).reduce((s, a) => s + world.nations.filter((b) => b.alive && b.id > a.id && world.relations?.[a.id]?.[b.id]?.state === 'war').length, 0);
    game.renderer.invalidateCache(); game.requestRender();
    return { forced: n, warPairs: wars, units: world.units.length };
  })()`);
  const cx = hx.W / 2; const cy = hx.H / 2;
  // Aynı kadraj görüntüsü (önce/sonra karşılaştırması): üç zoom.
  out.shots = [];
  // Kadraj karşılaştırması yalnız haritadır: kartlar ve bildirimler gerçek zamanlı TTL ile gelip
  // gider, iki koşuda aynı kalmaz. Arayüz gizlenir, harita tuvalleri kalır.
  const CLEAN = `(() => { const s = document.createElement('style'); s.id = 'hx-clean-style'; s.textContent = 'body.hx-clean * { visibility: hidden !important; } body.hx-clean canvas { visibility: visible !important; } body.hx-clean .flag-canvas, body.hx-clean #menu-preview, body.hx-clean canvas[aria-label] { visibility: hidden !important; }'; document.head.append(s); document.body.classList.add('hx-clean'); })()`;
  await hx.ev(CLEAN);
  for (const zoom of [0.45, 1.0, 2.2]) {
    await hx.ev(`(() => { game.camera.zoom = ${zoom}; game.camera.centerOn(__minisCenter.x, __minisCenter.y); game.renderer.invalidateCache(); game.requestRender(); })()`);
    await hx.sleep(2500);
    out.shots.push(await hx.shot(`${tag}-z${zoom}`));
  }
  await hx.ev("document.body.classList.remove('hx-clean')");
  if (/shots=1/.test(argv)) return out;
  // Ölçü başlangıcı: orta zoom, kalabalık cephenin üstü.
  await hx.ev(`(() => { game.camera.zoom = 0.8; game.camera.centerOn(__minisCenter.x, __minisCenter.y); game.requestRender(); })()`);
  await hx.sleep(1500);
  await hx.mouse('mouseMoved', cx, cy);
  await hx.send('Profiler.enable');
  await hx.send('Profiler.setSamplingInterval', { interval: 250 });

  // ZOOM: tekerlek adımları (deltaY 100), içeri ve dışarı tam tur; insan eli ~25 Hz'te çevirir.
  const wheel = async (dy, n, gap) => {
    for (let i = 0; i < n; i++) {
      await hx.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: cx + Math.sin(i) * 80, y: cy + Math.cos(i) * 50, deltaX: 0, deltaY: dy });
      await hx.sleep(gap);
    }
  };
  const runZoom = async () => {
    await wheel(-100, 14, 40);   // içeri
    await wheel(100, 24, 40);    // uzağa
    await wheel(-100, 18, 30);   // içeri, hızlı
    await wheel(100, 10, 60);
    await wheel(-100, 6, 40);
    await hx.sleep(300);
  };
  const trace = /trace=1/.test(argv);
  const events = [];
  let traceDone = null;
  if (trace) {
    hx.listeners.push((m) => { if (m.method === 'Tracing.dataCollected') events.push(...m.params.value); if (m.method === 'Tracing.tracingComplete') traceDone?.(); });
    await hx.send('Tracing.start', { transferMode: 'ReportEvents', traceConfig: { includedCategories: ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'gpu', 'cc', 'viz', 'toplevel', 'blink', 'v8', 'disabled-by-default-gpu.service'] } });
  }
  await hx.ev(RECORDER);
  await hx.send('Profiler.start');
  await runZoom();
  if (trace) {
    const done = new Promise((r) => { traceDone = r; });
    await hx.send('Tracing.end');
    await done;
    writeFileSync(join(hx.OUT, `${tag}-zoom.trace.json`), JSON.stringify({ traceEvents: events }));
  }
  const zoomProf = (await hx.send('Profiler.stop')).profile;
  out.zoom = await hx.ev(STOP);
  out.zoomProfile = topSelf(zoomProf);
  out.zoomRender = topTotal(zoomProf, 'src/render', 25);
  if (trace) return out;

  // KAYDIRMA: orta tuşla sürükleme, yakın ve uzak zoomda.
  const pan = async (zoom) => {
    await hx.ev(`(() => { game.camera.zoom = ${zoom}; game.camera.centerOn(__minisCenter.x, __minisCenter.y); game.requestRender(); })()`);
    await hx.sleep(1200);
    await hx.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: cx, y: cy, button: 'middle', buttons: 4, clickCount: 1 });
    let x = cx; let y = cy;
    for (let i = 0; i < 150; i++) {
      x += Math.cos(i / 20) * 9; y += Math.sin(i / 13) * 5;
      await hx.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'middle', buttons: 4 });
      await hx.sleep(12);
    }
    await hx.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'middle', buttons: 0, clickCount: 1 });
    await hx.sleep(400);
  };
  for (const zoom of [0.5, 1.8]) {
    await hx.ev(RECORDER);
    await hx.send('Profiler.start');
    await pan(zoom);
    const prof = (await hx.send('Profiler.stop')).profile;
    out[`pan${zoom}`] = await hx.ev(STOP);
    out[`pan${zoom}Profile`] = topSelf(prof, 18);
    out[`pan${zoom}Render`] = topTotal(prof, 'src/render', 18);
  }

  // Oyun akarken zoom (8x, haftalık dilim + yürüyüş kayması).
  await hx.ev(`(() => { game.camera.zoom = 0.8; game.camera.centerOn(__minisCenter.x, __minisCenter.y); game.setSpeed(8); })()`);
  await hx.sleep(1500);
  await hx.ev(RECORDER);
  await hx.send('Profiler.start');
  await runZoom();
  const runProf = (await hx.send('Profiler.stop')).profile;
  out.zoomRunning = await hx.ev(STOP);
  out.zoomRunningProfile = topSelf(runProf, 18);
  out.zoomRunningUi = topTotal(runProf, 'src/', 40);
  writeFileSync(join(hx.OUT, `${tag}-running.cpuprofile`), JSON.stringify(runProf));
  writeFileSync(join(hx.OUT, `${tag}-zoom.cpuprofile`), JSON.stringify(zoomProf));
  await hx.ev('game.setSpeed(0)');
  writeFileSync(join(hx.OUT, `${tag}-perf.json`), JSON.stringify(out, null, 1));
  return out;
}
