// Dinamik müziğin ortak motoru: zamanlayıcı, el hızı ölçeri, karıştırıcı
// gövdesi, çevrimdışı döküm. Parçalar (battleMusic.js, peaceMusic.js) yalnız
// partisyonu yazar; motor onları aynı arayüzle çalar:
//
//   static create(ctx, dest, opts)  → örnekleri yükleyip parçayı kurar
//   static tempoFor(micro)          → BPM
//   static tempoAt(micro, bar, step)→ isteğe bağlı: adım adım BPM (rubato)
//   static BARS                     → döngü uzunluğu (ölçü)
//   static layerLevels(level)       → bölük düzeyleri (deneme sayfası çubukları)
//   scheduleStep(t, dt, bar, step, level, micro)
//                                     `bar` MUTLAK sayaçtır: döngüdeki yer
//                                     bar % BARS, kaçıncı geçiş bar / BARS.
//                                     Geçişler aynı çalarsa döngü bir dakikada
//                                     ezberlenir — mobil oyun hissinin başı.
//   stinger(t, level)               → isteğe bağlı final darbesi
//   master                          → çıkış kazancı
//
// `level` parçaya göre anlam değiştirir: savaşta yoğunluk, barışta gerilim.
// Katman notu: tarayıcı ses API'si ister, oyun durumunu bilmez.

import { makeReverb } from './orchestra.js';

export const STEPS = 16;

export const clamp01 = (x) => Math.max(0, Math.min(1, x));
export const ramp = (x, a, b) => clamp01((x - a) / (b - a));

export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Sınırlayıcının kaçırdığı tepeler için: 0.9'a kadar dokunmaz, üstünü
 * 1.0'a yumuşakça büker. DynamicsCompressor duvar değildir; finalde
 * bütün orkestra aynı anda vurunca birkaç örnek tavanı aşıyordu.
 */
function softClip(ctx) {
  const ws = ctx.createWaveShaper();
  const n = 4096;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    const a = Math.abs(x);
    curve[i] = Math.sign(x) * (a <= 0.9 ? a : 0.9 + 0.1 * Math.tanh((a - 0.9) / 0.1));
  }
  ws.curve = curve;
  ws.oversample = '2x';
  return ws;
}

/**
 * Karıştırıcı: bölük kanalları → yankı → sıkıştırıcı → sınırlayıcı.
 * `buses` = { ad: [düzey, yankı payı] }. Her bölükte `fader` (yoğunluğa göre,
 * partisyon sürer) ve `trim` (sabit denge; solo ölçümde susturulur) ayrıdır.
 */
export function makeMixer(ctx, dest, buses) {
  const master = ctx.createGain();
  const glue = ctx.createDynamicsCompressor();
  glue.threshold.value = -14;
  glue.ratio.value = 2.5;
  glue.attack.value = 0.02;
  glue.release.value = 0.25;
  glue.knee.value = 8;
  const limit = ctx.createDynamicsCompressor();
  limit.threshold.value = -2;
  limit.ratio.value = 20;
  limit.attack.value = 0.001;
  limit.release.value = 0.08;
  limit.knee.value = 0;
  const sum = ctx.createGain();
  sum.gain.value = 0.6;
  sum.connect(glue).connect(limit).connect(softClip(ctx)).connect(master).connect(dest);

  const verb = makeReverb(ctx);
  const verbIn = ctx.createGain();
  // Ön gecikme: ilk yansıma geç gelince salon büyür, nota bulanmaz.
  const preDelay = ctx.createDelay(0.1);
  preDelay.delayTime.value = 0.03;
  verbIn.connect(preDelay).connect(verb).connect(sum);

  const bus = {};
  for (const [name, [level, send]] of Object.entries(buses)) {
    const input = ctx.createGain();
    const fader = ctx.createGain();
    fader.gain.value = 0;
    const trim = ctx.createGain();
    trim.gain.value = level;
    input.connect(fader).connect(trim).connect(sum);
    if (send) {
      const s = ctx.createGain();
      s.gain.value = send;
      trim.connect(s).connect(verbIn);
    }
    bus[name] = { input, fader, trim, level };
  }
  return { master, bus };
}

/** Ölçüm için tek bölük çal (diğerleri susar). */
export function soloBus(bus, name) {
  for (const [k, b] of Object.entries(bus)) b.trim.gain.value = !name || k === name ? b.level : 0;
}

/** Bölük düzeylerini adımın zamanına yumuşakça yaz. */
export function setFaders(bus, levels, t, tau = 0.35) {
  for (const [k, v] of Object.entries(levels)) bus[k].fader.gain.setTargetAtTime(v, t, tau);
}

/**
 * Cümle rubatosu: iki ölçülük cümlenin ortasında `push` kadar ileri, sonunda
 * `rit`'e kadar geri; döngünün son yarım ölçüsünde ayrıca `endRit` yavaşlama;
 * tek geçişler `oddSlow` kadar ağır. Sabit tempo, metronoma kilitli bir oyun
 * döngüsü gibi duyuluyordu (barış parçasında ölçüldü).
 */
export function phraseRubato(bpm, bar, step, bars, { push = 0.035, rit = 0.12, endRit = 0.12, oddSlow = 0.03 } = {}) {
  const lb = bar % bars;
  const x = ((lb % 2) * 16 + step) / 32;
  let f = 1 + push * Math.sin(Math.PI * x);
  if (x > 0.8) f -= rit * ((x - 0.8) / 0.2) ** 2;
  if (lb === bars - 1 && step >= 8) f -= endRit * ((step - 8) / 8);
  return bpm * f * (Math.floor(bar / bars) % 2 ? 1 - oddSlow : 1);
}

/** Adımın BPM'i: parça rubato veriyorsa ondan, yoksa yalnız el hızından. */
export const stepTempo = (Score, micro, bar, step) => (Score.tempoAt ? Score.tempoAt(micro, bar, step) : Score.tempoFor(micro));

// ---------------------------------------------------------------- el hızı

/**
 * Dakikadaki eylem: son 8 saniyedeki tık ve tuşlar. Fare tekerleği ve
 * sürükleme sayılmaz; harita gezmek mikro değildir.
 */
export class ApmMeter {
  constructor(windowSec = 8) {
    this.windowMs = windowSec * 1000;
    this.stamps = [];
  }
  hit(now = performance.now()) {
    this.stamps.push(now);
  }
  apm(now = performance.now()) {
    const from = now - this.windowMs;
    while (this.stamps.length && this.stamps[0] < from) this.stamps.shift();
    return (this.stamps.length * 60000) / this.windowMs;
  }
  /** 20 APM (sakin gezinti) → 0, 160 APM (cephede çılgın tık) → 1. */
  micro(now) {
    return ramp(this.apm(now), 20, 160);
  }
}

// ---------------------------------------------------------------- canlı çalım

const LOOKAHEAD = 0.14;
// rAF değil zamanlayıcı: rAF arka plan sekmesinde durur ve kare döngüsünü
// sürekli açık tutar (CLAUDE.md). 25 ms ileri bakışla 140 ms'yi doldurur.
const PUMP_MS = 25;

/**
 * `ctx`/`dest` verilirse çalar o bağlamı paylaşır (oyun: bütün parçalar tek
 * bağlamda, tek tampon kümesinde — bkz. orchestra.js bellek notu); verilmezse
 * kendi bağlamını açar (lab, atölye).
 */
export class MusicPlayer {
  constructor(Score, { volume = 0.8, ctx = null, dest = null } = {}) {
    this.Score = Score;
    this.volume = volume;
    this.ctx = ctx;
    this.dest = dest;
    this.score = null;
    this.loading = null;
    this.timer = null;
    this.target = 0.5;
    this.level = 0.5;
    this.micro = 0;
    this.manualMicro = null;
    this.meter = new ApmMeter();
    this.bar = 0;
    this.step = 0;
    this.nextTime = 0;
    this.onStep = null;
    this._onInput = () => this.meter.hit();
  }

  get playing() {
    return this.timer !== null;
  }

  get bpm() {
    return this.Score.tempoFor(this.micro);
  }

  /** Oyuncunun girdisini el hızına bağla (yakalama evresinde, pasif). */
  attachInput(target = window) {
    target.addEventListener('pointerdown', this._onInput, { capture: true, passive: true });
    target.addEventListener('keydown', this._onInput, { capture: true, passive: true });
    return () => {
      target.removeEventListener('pointerdown', this._onInput, { capture: true });
      target.removeEventListener('keydown', this._onInput, { capture: true });
    };
  }

  /** Savaşta yoğunluk, barışta gerilim (0..1). */
  setLevel(x) {
    this.target = clamp01(x);
  }

  /** null → el hızını ölçerden al; sayı → elle sabitle (deneme sayfası). */
  setMicro(x) {
    this.manualMicro = x == null ? null : clamp01(x);
  }

  /** Örnekleri çalmadan önce yükle; ilk vuruşta bekleme olmasın. */
  preload() {
    if (!this.loading) {
      this.ctx ??= new AudioContext({ latencyHint: 'playback' });
      this.loading = this.Score.create(this.ctx, this.dest ?? this.ctx.destination, { seed: Date.now() }).then((s) => (this.score = s));
    }
    return this.loading;
  }

  async start() {
    if (this.playing) return;
    await this.preload();
    await this.ctx.resume();
    if (this.playing) return;
    const { master } = this.score;
    const now = this.ctx.currentTime;
    master.gain.cancelScheduledValues(now);
    master.gain.setValueAtTime(this.volume, now);
    this.bar = 0;
    this.step = 0;
    this.nextTime = now + 0.06;
    this.timer = setInterval(() => this._pump(), PUMP_MS);
    this._pump();
  }

  _pump() {
    const { ctx, score } = this;
    const horizon = ctx.currentTime + LOOKAHEAD;
    while (this.nextTime < horizon) {
      // Adım başına yumuşatma: ani bir tık patlaması tempoyu sarsmasın.
      const wantMicro = this.manualMicro ?? this.meter.micro();
      this.micro += (wantMicro - this.micro) * 0.06;
      this.level += (this.target - this.level) * 0.05;
      const dt = 60 / stepTempo(this.Score, this.micro, this.bar, this.step) / 4;
      score.scheduleStep(this.nextTime, dt, this.bar, this.step, this.level, this.micro);
      this.onStep?.(this);
      this.nextTime += dt;
      if (++this.step === STEPS) {
        this.step = 0;
        this.bar++;
      }
    }
  }

  /** Parça biter: final darbesi varsa bir sonraki adımda çalar, sonra sessizlik. */
  end() {
    if (!this.playing) return;
    if (!this.score.stinger) return this.stop(3);
    clearInterval(this.timer);
    this.timer = null;
    const t = Math.max(this.nextTime, this.ctx.currentTime + 0.05);
    this.score.stinger(t, this.level);
    this.score.master.gain.setTargetAtTime(0, t + 2.6, 0.6);
  }

  stop(fade = 1.2) {
    if (!this.playing) return;
    clearInterval(this.timer);
    this.timer = null;
    const g = this.score.master.gain;
    g.cancelScheduledValues(this.ctx.currentTime);
    g.setTargetAtTime(0, this.ctx.currentTime, fade / 4);
  }
}

// ---------------------------------------------------------------- olay müziği

/**
 * Tek seferlik olay müziği (savaş ilanı, zafer, yenilgi): döngü yok, el hızı
 * yok. Sınıf arayüzü: static create(ctx, dest), static CUES (ad → süre sn),
 * cue(ad, t) — hepsini t'den başlayarak zamanlar; master.
 */
export class CuePlayer {
  constructor(Cues, { volume = 0.8, ctx = null, dest = null } = {}) {
    this.Cues = Cues;
    this.volume = volume;
    this.ctx = ctx;
    this.dest = dest;
    this.loading = null;
  }

  preload() {
    if (!this.loading) {
      this.ctx ??= new AudioContext({ latencyHint: 'playback' });
      this.loading = this.Cues.create(this.ctx, this.dest ?? this.ctx.destination);
    }
    return this.loading;
  }

  /** Her çağrıda yeni karıştırıcı: üst üste gelen iki olay birbirinin kuyruğunu kesmesin. */
  async play(name) {
    await this.preload();
    await this.ctx.resume();
    const cue = await this.Cues.create(this.ctx, this.dest ?? this.ctx.destination);
    cue.master.gain.value = this.volume;
    cue.cue(name, this.ctx.currentTime + 0.05);
  }
}

export async function renderCue(Cues, name, { sampleRate = 44100 } = {}) {
  const seconds = Cues.CUES[name];
  const ctx = new OfflineAudioContext(2, Math.round(seconds * sampleRate), sampleRate);
  const cue = await Cues.create(ctx, ctx.destination);
  cue.cue(name, 0.05);
  const g = cue.master.gain;
  g.setValueAtTime(1, seconds - 0.6);
  g.linearRampToValueAtTime(0, seconds);
  return { buffer: await ctx.startRendering(), hitAt: 0, barTimes: [] };
}

// ---------------------------------------------------------------- döküm

/**
 * Bir parçayı çevrimdışı çalar. `curve` = { bars, level(x), micro(x) }, x ölçü
 * cinsinden zaman. Final darbesi olan parça son ölçüden sonra onu çalar;
 * olmayan son iki saniyede söner.
 */
export async function renderPiece(Score, curve, { seconds, sampleRate = 44100, solo = null } = {}) {
  const ctx = new OfflineAudioContext(2, Math.round(seconds * sampleRate), sampleRate);
  const score = await Score.create(ctx, ctx.destination);
  soloBus(score.bus, solo);
  let t = 0.05;
  const barTimes = [];
  for (let bar = 0; bar < curve.bars; bar++) {
    barTimes.push(t);
    for (let step = 0; step < STEPS; step++) {
      const x = bar + step / STEPS;
      const micro = curve.micro(x);
      const dt = 60 / stepTempo(Score, micro, bar, step) / 4;
      score.scheduleStep(t, dt, bar, step, curve.level(x), micro);
      t += dt;
    }
  }
  const g = score.master.gain;
  if (score.stinger) {
    score.stinger(t);
    g.setValueAtTime(1, Math.max(t + 0.1, seconds - 0.9));
    g.linearRampToValueAtTime(0, seconds);
  } else {
    g.setValueAtTime(1, Math.min(t, seconds - 2));
    g.linearRampToValueAtTime(0, seconds);
  }
  const buffer = await ctx.startRendering();
  barTimes.push(t);
  return { buffer, hitAt: t, barTimes };
}

/** 16 bit PCM WAV. */
export function toWav(buffer) {
  const ch = buffer.numberOfChannels;
  const n = buffer.length;
  const data = new DataView(new ArrayBuffer(44 + n * ch * 2));
  const str = (o, s) => [...s].forEach((c, i) => data.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF');
  data.setUint32(4, 36 + n * ch * 2, true);
  str(8, 'WAVEfmt ');
  data.setUint32(16, 16, true);
  data.setUint16(20, 1, true);
  data.setUint16(22, ch, true);
  data.setUint32(24, buffer.sampleRate, true);
  data.setUint32(28, buffer.sampleRate * ch * 2, true);
  data.setUint16(32, ch * 2, true);
  data.setUint16(34, 16, true);
  str(36, 'data');
  data.setUint32(40, n * ch * 2, true);
  const chans = [...Array(ch)].map((_, c) => buffer.getChannelData(c));
  let o = 44;
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < ch; c++) {
      const v = Math.max(-1, Math.min(1, chans[c][i]));
      data.setInt16(o, v < 0 ? v * 0x8000 : v * 0x7fff, true);
      o += 2;
    }
  }
  return data.buffer;
}

/** Ölçüm: yarım saniyelik RMS (dBFS), tepe, kırpılan örnek sayısı. */
export function analyze(buffer, slice = 0.5) {
  const L = buffer.getChannelData(0);
  const R = buffer.getChannelData(1);
  const w = Math.round(buffer.sampleRate * slice);
  const rms = [];
  let peak = 0;
  let clipped = 0;
  let total = 0;
  for (let s = 0; s < L.length; s += w) {
    let acc = 0;
    const e = Math.min(L.length, s + w);
    for (let i = s; i < e; i++) {
      const a = Math.abs(L[i]);
      const b = Math.abs(R[i]);
      peak = Math.max(peak, a, b);
      if (a >= 0.999 || b >= 0.999) clipped++;
      acc += L[i] * L[i] + R[i] * R[i];
    }
    total += acc;
    rms.push(+(10 * Math.log10(acc / (2 * (e - s)) + 1e-12)).toFixed(1));
  }
  const overall = +(10 * Math.log10(total / (2 * L.length) + 1e-12)).toFixed(1);
  return { rms, overall, peak: +peak.toFixed(3), clipped };
}
