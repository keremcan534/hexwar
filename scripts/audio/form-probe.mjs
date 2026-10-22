// Müziğin "mobil oyun" ölçüleri: döngü tekrarı, dinamik aralık, tempo, susma.
//
//   node scripts/audio/form-probe.mjs [etiket] [parça,parça]
//
// Her parça İKİ döngü geçişi boyunca SABİT ayarla (yoğunluk/gerilim ve el hızı
// değişmeden) çalınır; böylece iki geçiş arasındaki fark yalnız partisyonun
// kendi çeşitlemesidir. Ölçüler:
//   geçiş farkı  — her ölçünün oktav bandı enerjileri, 1. geçiş ile 2. geçiş
//                  arasında ortalama |dB| farkı. Birebir tekrar eden döngü ≈ 0-1 dB
//                  (yalnız round robin ve zamanlama sapması).
//   dinamik      — 0.4 sn RMS'in p95 − p10'u (dB). Sürekli duvar ≈ 2 dB.
//   tempo        — ölçü sürelerinden BPM aralığı (rubato görünür).
//   susma        — 0.25 sn pencerelerin ortancadan ≥15 dB kısık olan payı.
//   ritim        — her ölçünün 23 ms'lik ses zarfı, iki geçiş arasında korelasyon
//                  (1 = aynı ritim). Bant enerjisi ritmi görmez: çug duvarı ile
//                  çınlayan akor aynı bantlardadır.
// Taban: eski motor her geçişi birebir aynı çalıyordu; farkı yalnız rastgele
// mikro zamanlama ve çalım sırası veriyordu. Bunu ölçmek için ilk geçiş ikinci
// kez, bağımsız çalınır ve onunla karşılaştırılır ("aynı döngü tabanı").
// Sonuç scripts/audit/_tmp/audio/form-<etiket>.json (gitignore).
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { launch } from "../../trailer/capture/cdp.mjs";

const OUT = "scripts/audit/_tmp/audio";
const label = process.argv[2] ?? "son";
const CASES = [
  { name: "savas yoğun", piece: "savas", level: 0.9, micro: 0.6, bars: 16, seconds: 36 },
  { name: "barış sakin", piece: "baris", level: 0.1, micro: 0.3, bars: 16, seconds: 64 },
  { name: "barış gergin", piece: "baris", level: 0.8, micro: 0.5, bars: 16, seconds: 64 },
  { name: "sefer yüksek", piece: "sefer", level: 0.8, micro: 0.5, bars: 16, seconds: 44 },
  { name: "devlet sıcak", piece: "devlet", level: 0.6, micro: 0.3, bars: 16, seconds: 72 },
  { name: "deniz savaşı", piece: "deniz", level: 0.85, micro: 0.4, bars: 16, seconds: 52 },
  { name: "kargaşa", piece: "kargasa", level: 0.75, micro: 0.4, bars: 16, seconds: 40 },
];
// Yalnız bazı durumlar: node form-probe.mjs etiket sefer,devlet
const only = process.argv[3]?.split(",");
if (only) CASES.splice(0, CASES.length, ...CASES.filter((c) => only.includes(c.piece)));

function decodeWav(b64) {
  const buf = Buffer.from(b64, "base64");
  const sr = buf.readUInt32LE(24);
  const ch = buf.readUInt16LE(22);
  const n = (buf.length - 44) / (2 * ch);
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let c = 0; c < ch; c++) s += buf.readInt16LE(44 + (i * ch + c) * 2) / 32768;
    x[i] = s / ch;
  }
  return { x, sr };
}

function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    for (let i = 0; i < n; i += len) {
      for (let k = 0; k < len / 2; k++) {
        const wr = Math.cos(ang * k), wi = Math.sin(ang * k);
        const a = i + k, b = a + len / 2;
        const xr = re[b] * wr - im[b] * wi, xi = re[b] * wi + im[b] * wr;
        re[b] = re[a] - xr; im[b] = im[a] - xi;
        re[a] += xr; im[a] += xi;
      }
    }
  }
}

const BANDS = [63, 125, 250, 500, 1000, 2000, 4000, 8000];

/** Bir bölümün oktav bandı enerjileri (dB), 4096'lık pencerelerin ortalaması. */
function bandsDb(x, sr, a, b) {
  const N = 4096;
  const acc = new Float64Array(BANDS.length);
  const win = Float64Array.from({ length: N }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N));
  let frames = 0;
  for (let s = Math.floor(a * sr); s + N <= Math.floor(b * sr); s += N / 2) {
    const re = new Float64Array(N), im = new Float64Array(N);
    for (let i = 0; i < N; i++) re[i] = x[s + i] * win[i];
    fft(re, im);
    for (let k = 1; k < N / 2; k++) {
      const f = (k * sr) / N;
      const bi = BANDS.findIndex((c) => f >= c / Math.SQRT2 && f < c * Math.SQRT2);
      if (bi >= 0) acc[bi] += re[k] * re[k] + im[k] * im[k];
    }
    frames++;
  }
  return [...acc].map((e) => 10 * Math.log10(e / Math.max(1, frames) + 1e-12));
}

/** Ölçünün ses zarfı: 23 ms pencerelerin dB'si, 64 noktaya yeniden örneklenmiş. */
function envelope(x, sr, a, b) {
  const hop = 512, n = 1024;
  const e = [];
  for (let s = Math.floor(a * sr); s + n <= Math.floor(b * sr); s += hop) {
    let acc = 0;
    for (let i = 0; i < n; i++) acc += x[s + i] * x[s + i];
    e.push(10 * Math.log10(acc / n + 1e-9));
  }
  return Array.from({ length: 64 }, (_, k) => e[Math.min(e.length - 1, Math.floor((k / 64) * e.length))]);
}

function corr(u, v) {
  const mu = u.reduce((s, x) => s + x, 0) / u.length, mv = v.reduce((s, x) => s + x, 0) / v.length;
  let num = 0, du = 0, dv = 0;
  for (let i = 0; i < u.length; i++) {
    num += (u[i] - mu) * (v[i] - mv);
    du += (u[i] - mu) ** 2;
    dv += (v[i] - mv) ** 2;
  }
  return num / Math.sqrt(du * dv + 1e-12);
}

/** İki bölümün ölçü ölçü karşılaştırması: bant farkı (dB) ve ritim korelasyonu. */
function compareBars(xa, bta, oa, xb, btb, ob, bars, sr) {
  const band = [], rhythm = [];
  for (let i = 0; i < bars; i++) {
    const A = bandsDb(xa, sr, bta[oa + i], bta[oa + i + 1]);
    const B = bandsDb(xb, sr, btb[ob + i], btb[ob + i + 1]);
    band.push(+(A.reduce((s, v, k) => s + Math.abs(v - B[k]), 0) / A.length).toFixed(1));
    rhythm.push(+corr(envelope(xa, sr, bta[oa + i], bta[oa + i + 1]), envelope(xb, sr, btb[ob + i], btb[ob + i + 1])).toFixed(2));
  }
  const mean = (a) => +(a.reduce((s, v) => s + v, 0) / a.length).toFixed(2);
  return { band, rhythm, bandMean: mean(band), rhythmMean: mean(rhythm) };
}

function rmsDb(x, sr, a, b) {
  let s = 0, n = 0;
  for (let i = Math.floor(a * sr); i < Math.floor(b * sr) && i < x.length; i++, n++) s += x[i] * x[i];
  return 10 * Math.log10(s / Math.max(1, n) + 1e-12);
}

const pct = (arr, p) => [...arr].sort((u, v) => u - v)[Math.min(arr.length - 1, Math.floor((p / 100) * arr.length))];

const port = 6700 + Math.floor(Math.random() * 500);
const server = spawn(process.execPath, ["scripts/dev-server.mjs"], { env: { ...process.env, PORT: String(port) }, stdio: "ignore" });
for (let i = 0; i < 50; i++) {
  try { await fetch(`http://127.0.0.1:${port}/muziklab.html`); break; } catch { await new Promise((r) => setTimeout(r, 100)); }
}
const page = await launch({ width: 1200, height: 900, gpu: false });
const results = [];
try {
  await page.goto(`http://127.0.0.1:${port}/muziklab.html`);
  // Sayfa modülü çökerse kanca hiç tanımlanmaz; sonsuza dek beklemek yerine 60 sn'de düş.
  await page.evaluate("new Promise((r, j) => { const t0 = Date.now(); const w = () => window.__renderPiece ? r() : Date.now() - t0 > 60000 ? j(new Error('sayfa modülü yüklenmedi (__renderPiece yok) — tarayıcı konsoluna bak')) : setTimeout(w, 50); w(); })");
  mkdirSync(OUT, { recursive: true });
  for (const c of CASES) {
    const fixed = { bars: c.bars, seconds: c.seconds, level: c.level, micro: c.micro };
    const r = await page.evaluate(`window.__renderPiece(${JSON.stringify(c.piece)}, null, ${JSON.stringify(fixed)})`);
    const { x, sr } = decodeWav(r.wav);
    writeFileSync(join(OUT, `form-${label}-${c.name.replace(" ", "-")}.wav`), Buffer.from(r.wav, "base64"));
    const bt = r.barTimes;
    const half = c.bars / 2;
    // Aynı döngü tabanı: ilk geçiş bağımsız ikinci kez.
    const fixed0 = { bars: half, seconds: Math.ceil(c.seconds / 2) + 4, level: c.level, micro: c.micro };
    const r0 = await page.evaluate(`window.__renderPiece(${JSON.stringify(c.piece)}, null, ${JSON.stringify(fixed0)})`);
    const base = decodeWav(r0.wav);
    const varied = compareBars(x, bt, 0, x, bt, half, half, sr);
    const same = compareBars(x, bt, 0, base.x, r0.barTimes, 0, half, sr);
    const a0 = bt[0] + 1, a1 = bt[c.bars] - 0.5;
    const w4 = [];
    for (let t = a0; t + 0.4 <= a1; t += 0.4) w4.push(rmsDb(x, sr, t, t + 0.4));
    const w25 = [];
    for (let t = a0; t + 0.25 <= a1; t += 0.25) w25.push(rmsDb(x, sr, t, t + 0.25));
    const med = pct(w25, 50);
    const bpm = bt.slice(1, c.bars + 1).map((t, i) => (4 * 60) / (t - bt[i]));
    const res = {
      name: c.name,
      varied,
      same,
      dynamic: +(pct(w4, 95) - pct(w4, 10)).toFixed(1),
      bpm: [+Math.min(...bpm).toFixed(1), +Math.max(...bpm).toFixed(1)],
      bpmPerBar: bpm.map((v) => +v.toFixed(1)),
      silence: +((100 * w25.filter((v) => v <= med - 15).length) / w25.length).toFixed(1),
      peak: r.analysis.peak,
      clipped: r.analysis.clipped,
    };
    results.push(res);
    console.log(`${c.name}: dinamik ${res.dynamic} dB · tempo ${res.bpm[0]}-${res.bpm[1]} · susma %${res.silence} · tepe ${res.peak} · kırpılan ${res.clipped}`);
    console.log(`  bant farkı   aynı döngü tabanı ${String(same.bandMean).padStart(5)} dB | 1. ↔ 2. geçiş ${String(varied.bandMean).padStart(5)} dB  (ölçü: ${varied.band.join(" ")})`);
    console.log(`  ritim benzer aynı döngü tabanı ${String(same.rhythmMean).padStart(5)}    | 1. ↔ 2. geçiş ${String(varied.rhythmMean).padStart(5)}     (ölçü: ${varied.rhythm.join(" ")})`);
  }
  writeFileSync(join(OUT, `form-${label}.json`), JSON.stringify(results, null, 1));
} finally {
  await Promise.race([page.close(), new Promise((r) => setTimeout(r, 3000))]);
  server.kill();
}
process.exit(0);
