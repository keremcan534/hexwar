// Ambiyans ve savaş sesi düzey ölçümü + müzik seçicinin görüntüsü.
//   PORT=5193 node scripts/dev-server.mjs
//   node scripts/ui/hx.mjs --plan scripts/ui/ambience-levels.plan.mjs --gpu --w 1536 --h 864 --port 9343 --server http://localhost:5193 --out .shots/ses
//
// 1. Çevrimdışı (OfflineAudioContext, 30 s): aynı sahne iki yoldan — eski
//    beş kayıt (assets/audio/ambience/*.ogg, yerelde varsa) eski kazançlarla,
//    yeni sentez (ui/soundscape.js) yeni kazançlarla. Ölçülen: tepe ve RMS
//    (dBFS), 4 kHz üstü enerji payı, en sert başlangıç (10 ms RMS'in önceki
//    200 ms ortalamasına oranı, dB).
// 2. Canlı: oyunun kendi ambiyansına AnalyserNode takılır; barış, savaşa
//    yakın kamera (frontLevel sınama için ezilir, dünyaya yazılmaz) ve 8x.
// 3. Müzik seçici açılır, üç pencere boyunda yerleşim sondası + görüntü.
import { join } from 'node:path';

const OFFLINE = String.raw`(async () => {
  const { Soundscape } = await import('/src/ui/soundscape.js');
  const RATE = 48000; const SECS = 30;
  const stats = async (buf) => {
    const n = buf.length; const L = buf.getChannelData(0); const R = buf.getChannelData(1);
    let peak = 0; let sum = 0;
    const mono = new Float32Array(n);
    for (let i = 0; i < n; i++) { const v = (L[i] + R[i]) / 2; mono[i] = v; const a = Math.max(Math.abs(L[i]), Math.abs(R[i])); if (a > peak) peak = a; sum += v * v; }
    const rms = Math.sqrt(sum / n);
    // 4 kHz üstü: yüksek geçirgenden ikinci geçiş.
    const oc = new OfflineAudioContext(1, n, RATE);
    const src = oc.createBufferSource(); const b = oc.createBuffer(1, n, RATE); b.copyToChannel(mono, 0); src.buffer = b;
    const hp = oc.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 4000; hp.Q.value = 0.7;
    src.connect(hp).connect(oc.destination); src.start();
    const hpBuf = await oc.startRendering(); const H = hpBuf.getChannelData(0);
    let hs = 0; for (let i = 0; i < n; i++) hs += H[i] * H[i];
    // En sert başlangıç: 10 ms pencere RMS / önceki 200 ms RMS.
    const w = RATE / 100; const win = []; for (let i = 0; i + w <= n; i += w) { let s = 0; for (let j = i; j < i + w; j++) s += mono[j] * mono[j]; win.push(Math.sqrt(s / w)); }
    let jump = 0;
    // İlk 2 s atlanır: katmanların sessizlikten açılışı başlangıç sayılmaz.
    for (let i = 200; i < win.length; i++) { let s = 0; for (let j = i - 20; j < i; j++) s += win[j] * win[j]; const prev = Math.sqrt(s / 20) + 1e-6; if (win[i] > 0.003) jump = Math.max(jump, win[i] / prev); }
    const db = (x) => Math.round(20 * Math.log10(Math.max(x, 1e-9)) * 10) / 10;
    return { peakDb: db(peak), rmsDb: db(rms), crestDb: Math.round((db(peak) - db(rms)) * 10) / 10, hfSharePct: Math.round((hs / Math.max(sum, 1e-12)) * 1000) / 10, worstOnsetDb: db(jump) };
  };
  const vol = 0.6; // kaydırıcı 60 (varsayılan)
  // Eski yol: ambience.js (390852d) kazançları, MIX_TRIM 0.55.
  const oldScene = async (gains) => {
    const oc = new OfflineAudioContext(2, RATE * SECS, RATE);
    const master = oc.createGain(); master.gain.value = vol * 0.55; master.connect(oc.destination);
    for (const [name, g] of Object.entries(gains)) {
      if (!g) continue;
      const res = await fetch('/assets/audio/ambience/' + name + '.ogg'); if (!res.ok) return null;
      const buf = await oc.decodeAudioData(await res.arrayBuffer());
      const s = oc.createBufferSource(); s.buffer = buf; s.loop = true;
      const gn = oc.createGain(); gn.gain.value = g; s.connect(gn).connect(master); s.start(0, 17 % buf.duration);
    }
    return stats(await oc.startRendering());
  };
  const newScene = async (levels) => {
    const oc = new OfflineAudioContext(2, RATE * SECS, RATE);
    const master = oc.createGain(); master.gain.value = vol * 0.5; master.connect(oc.destination);
    const sc = new Soundscape(oc, master);
    sc.set(levels, 0);
    // Katmanlar ~7 s'de oturur; ölçüm bütün 30 s (giriş dahil).
    sc.pump(SECS);
    const st = await stats(await oc.startRendering());
    return { ...st, events: sc.counts };
  };
  // Sahne: near 0.6, ekranın %30'u deniz; savaşta tek muharebe kulak menzilinin %20 içinde.
  const near = 0.6; const sea = 0.3;
  const oldPeace = { wind: 0.32 + 0.28 * (1 - near), ocean: Math.min(0.9, sea * (0.5 + 0.2 * near)) };
  const oldWar = { wind: oldPeace.wind * 0.3, ocean: oldPeace.ocean, 'war-rain': 0.42, front: 0.1 + 0.65 * 0.8 * (0.25 + 0.75 * near) };
  const w1 = 0.8 ** 1.5;
  const front1 = (1 - Math.exp(-1.4 * w1)) * (0.3 + 0.7 * near);
  const front5 = (1 - Math.exp(-1.4 * w1 * 5)) * (0.3 + 0.7 * near);
  const country = (1 - sea) * near ** 1.3;
  const newPeace = { wind: 0.3 + 0.3 * (1 - near), sea: sea * (0.45 + 0.4 * near), country: country * 0.8 };
  const newWar = { wind: newPeace.wind * 0.75, sea: newPeace.sea, country: country * 0.2, front: front1, fronts: 1 };
  const newWar5 = { ...newWar, front: front5, fronts: 5 };
  return {
    old: { peace: await oldScene(oldPeace), war: await oldScene(oldWar) },
    new: { peace: await newScene(newPeace), war1: await newScene(newWar), war5: await newScene(newWar5) },
    gains: { oldPeace, oldWar, newPeace, newWar, newWar5 },
  };
})()`;

const LIVE_TAP = String.raw`(() => {
  const a = game.ambience; a.boot();
  const ctx = a.ctx; const an = ctx.createAnalyser(); an.fftSize = 32768; an.smoothingTimeConstant = 0;
  a.master.connect(an);
  const buf = new Float32Array(an.fftSize);
  const acc = { peak: 0, sum: 0, n: 0 };
  clearInterval(window.__ambTap);
  window.__ambTap = setInterval(() => { an.getFloatTimeDomainData(buf); for (const v of buf) { const x = Math.abs(v); if (x > acc.peak) acc.peak = x; acc.sum += v * v; acc.n++; } }, 300);
  window.__ambRead = () => { const db = (x) => Math.round(20 * Math.log10(Math.max(x, 1e-9)) * 10) / 10; const r = { peakDb: db(acc.peak), rmsDb: db(Math.sqrt(acc.sum / Math.max(1, acc.n))) }; acc.peak = 0; acc.sum = 0; acc.n = 0; return r; };
  return ctx.state;
})()`;

export default async function plan(hx) {
  const out = {};
  await hx.sleep(1500);
  // Gerçek kullanıcı dokunuşu: ses politikası ilk etkileşimi bekler.
  await hx.key('Shift');
  await hx.sleep(400);
  out.offline = await hx.ev(OFFLINE);

  out.liveCtx = await hx.ev(LIVE_TAP);
  await hx.ev('game.setSpeed(1)');
  await hx.sleep(9000);
  await hx.ev('__ambRead()');
  await hx.sleep(6000);
  out.livePeace = { level: await hx.ev('__ambRead()'), state: await hx.ev('game.ambience.state()') };
  // Savaş sınaması: muharebe okuyucusu ezilir (dünya değişmez), 5 muharebe.
  await hx.ev('(() => { const a = game.ambience; a.__front = a.frontLevel; a.frontLevel = () => ({ level: 0.7, count: 5 }); a.update(); })()');
  await hx.sleep(8000);
  await hx.ev('__ambRead()');
  await hx.sleep(6000);
  out.liveWar5 = { level: await hx.ev('__ambRead()'), state: await hx.ev('game.ambience.state()') };
  // 8x: olay sıklığı duvar saatine bağlı, ses yığılmamalı.
  const before = await hx.ev('({ ...game.ambience.scape.counts })');
  await hx.ev('game.setSpeed(8)');
  let maxVoices = 0;
  for (let i = 0; i < 20; i++) { await hx.sleep(500); maxVoices = Math.max(maxVoices, await hx.ev('game.ambience.scape.playing()')); }
  const after = await hx.ev('({ ...game.ambience.scape.counts })');
  out.live8x = { seconds: 10, cannonPerSec: (after.cannon - before.cannon) / 10, cracklePerSec: (after.crackle - before.crackle) / 10, maxVoices, skipped: after.skipped - before.skipped, level: await hx.ev('__ambRead()') };
  await hx.ev('game.setSpeed(0)');
  await hx.ev('(() => { const a = game.ambience; a.frontLevel = a.__front; a.update(); })()');

  // Müzik seçici.
  await hx.inject(join(hx.probes, 'layout-probe.js'));
  out.picker = {};
  for (const [w, h] of [[1366, 768], [1536, 864], [1920, 1080]]) {
    await hx.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
    await hx.sleep(700);
    const probe = '(() => { const p = __layoutProbe(document.querySelector(".hud-header")); return { unreachable: p.unreachable.length, offscreen: p.offscreen.length, samples: [...p.unreachable, ...p.offscreen].slice(0, 4) }; })()';
    const bar = await hx.ev(probe);
    const rect = await hx.ev('(() => { const r = (s) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.top), Math.round(b.width), Math.round(b.height)]; }; return { music: r("#btn-music"), settings: r("#btn-settings"), clock: r("#turn-control"), bar: r(".topbar"), stats: r(".top-stats") }; })()');
    await hx.clickSel('#btn-music');
    await hx.sleep(400);
    const pop = await hx.ev('(() => { const p = __layoutProbe(document.querySelector("#music-pop")); const b = document.querySelector("#music-pop").getBoundingClientRect(); return { unreachable: p.unreachable.length, offscreen: p.offscreen.length, rect: [Math.round(b.left), Math.round(b.top), Math.round(b.width), Math.round(b.height)], inView: b.right <= innerWidth && b.bottom <= innerHeight && b.left >= 0 }; })()');
    await hx.shot(`muzik-secici-${w}`);
    await hx.shot(`muzik-secici-${w}-yakin`, { x: w - 520, y: 0, width: 520, height: 470 }, 1);
    await hx.key('Escape');
    await hx.sleep(200);
    out.picker[w] = { bar, pop, rect, closedByEsc: await hx.ev('document.querySelector("#music-pop").hidden') };
  }
  // Parça seç → çalınan parça ve kip.
  await hx.clickSel('#btn-music');
  await hx.sleep(200);
  await hx.clickSel('#music-pop [data-track="legionnaire"]');
  await hx.sleep(2500);
  out.trackPick = await hx.ev('game.music.describe()');
  await hx.shot('muzik-secici-parca', { x: 1920 - 520, y: 0, width: 520, height: 470 }, 1);
  await hx.clickSel('#music-pop [data-act="next"]');
  await hx.sleep(1500);
  out.trackNext = await hx.ev('game.music.describe()');
  await hx.clickSel('#music-pop [data-act="off"]');
  await hx.sleep(500);
  out.off = await hx.ev('game.music.describe()');
  await hx.clickSel('#music-pop [data-act="auto"]');
  await hx.sleep(2500);
  out.auto = await hx.ev('game.music.describe()');
  return out;
}
