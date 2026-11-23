// Haritanın ses manzarası: rüzgâr, deniz, kır ve uzak cephe — hepsi Web Audio
// ile SENTEZ, dosya yok.
//
// Neden sentez: eski ambiyans beş YouTube kaydıydı (lisansı belirsiz, depoya
// girmiyordu, yayın paketinde hiç çalmıyordu). Kulağı yoran da onlardı:
// 120 s'lik döngü kırk beş yıllık kampanyada tanınır hâle geliyordu ve
// "yağmur + topçu" kaydı savaş boyunca kameradan bağımsız sabit düzeyde
// sürüyordu. Gürültüden süzülen ses her an yeniden kurulur: hiçbir an tekrar
// etmez, tiz bileşeni süzgeçle baştan kesilir, düzeyi tek bir yerde durur.
//
// Kurallar (Kerem: "kulak siken tarzdan olmasın"):
// - Her katman yavaş girer ve çıkar (LAYER_TAU ~2.5 s, ~7 s'de oturur).
// - Bütün zarfların başı yumuşak: top gümbürtüsü bile 25-45 ms'de açılır,
//   tık ya da ani patlama yok. Savaş yolu sıkıştırıcıdan ve 1.6 kHz alçak
//   geçirgenden çıkar: uzaktan duyulan top boğuktur.
// - Olay sıklığı DUVAR SAATİNE bağlıdır, oyun hızına değil: 8x'te de
//   saniyede en çok bir top vuruşu ve aynı anda en çok MAX_VOICES ses.
// - Rastgelelik kendi Math.random'umuz: oyunun zarına dokunmaz.
//
// Zamanlama: pump(until) olayları ses saatinde ileriye yazar. Canlı oyunda
// yarım saniyede bir (setInterval; rAF yok), ölçümde OfflineAudioContext
// üstünde tek seferde çağrılır — aynı kod, aynı ses.
//
// Katman notu: ui katmanı; oyun durumunu bilmez, hedefleri Ambience verir.

const LAYER_TAU = 2.5;
/** Savaş hızla girmeli ki muharebe başlayınca duyulsun, ama yine sıçramasın. */
const FRONT_TAU = 1.6;
/** Aynı anda çalan olay sesi tavanı (top + tüfek + kuş): 8x'te yığılma yok. */
const MAX_VOICES = 10;
/** Gürültü tamponu boyu (s): döngü dikişi eşit güçle bindirilir. */
const NOISE_S = 9;

const rand = (a, b) => a + Math.random() * (b - a);
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

export class Soundscape {
  constructor(ctx, output) {
    this.ctx = ctx;
    this.out = ctx.createGain();
    this.out.gain.value = 1;
    this.out.connect(output);
    this.levels = { wind: 0, sea: 0, country: 0, front: 0, fronts: 0, naval: 0 };
    this.voices = [];
    this.pumpedTo = ctx.currentTime;
    this.next = {};
    this.counts = { cannon: 0, crackle: 0, bird: 0, wave: 0, gust: 0, skipped: 0 };

    this.brown = this.noise('brown');
    this.pink = this.noise('pink');

    this.windBus = this.bus();
    this.seaBus = this.bus();
    this.countryBus = this.bus();
    // Savaş yolu: alçak geçirgen + sıkıştırıcı. Birden çok muharebe aynı anda
    // vursa da tepe burada tutulur.
    this.frontBus = this.bus(false);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1600;
    lp.Q.value = 0.5;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -26;
    comp.knee.value = 12;
    comp.ratio.value = 5;
    comp.attack.value = 0.012;
    comp.release.value = 0.5;
    this.frontBus.connect(lp).connect(comp).connect(this.out);

    this.buildWind();
    this.buildSea();
    this.buildFrontBed();
  }

  // ---- yapı ----------------------------------------------------------------

  bus(connect = true) {
    const g = this.ctx.createGain();
    g.gain.value = 0;
    if (connect) g.connect(this.out);
    return g;
  }

  /** Dikişsiz döngü: kuyruk başa eşit güçle bindirilir, sıçrama (tık) olmaz. */
  noise(kind) {
    const { ctx } = this;
    const rate = ctx.sampleRate;
    const n = Math.round(NOISE_S * rate);
    const fade = Math.round(0.5 * rate);
    const buf = ctx.createBuffer(2, n, rate);
    for (let ch = 0; ch < 2; ch++) {
      const g = new Float32Array(n + fade);
      let b0 = 0; let b1 = 0; let b2 = 0; let last = 0;
      let peak = 1e-9;
      for (let i = 0; i < g.length; i++) {
        const w = Math.random() * 2 - 1;
        let v;
        if (kind === 'brown') {
          last = (last + 0.02 * w) / 1.02;
          v = last;
        } else {
          // Paul Kellet'in ekonomik pembe gürültüsü.
          b0 = 0.99765 * b0 + w * 0.099046;
          b1 = 0.963 * b1 + w * 0.2965164;
          b2 = 0.57 * b2 + w * 1.0526913;
          v = b0 + b1 + b2 + w * 0.1848;
        }
        g[i] = v;
        if (Math.abs(v) > peak) peak = Math.abs(v);
      }
      const data = buf.getChannelData(ch);
      const k = 0.9 / peak;
      for (let i = 0; i < n; i++) {
        let v = g[i];
        if (i < fade) {
          const x = i / fade;
          v = g[i] * Math.sqrt(x) + g[n + i] * Math.sqrt(1 - x);
        }
        data[i] = v * k;
      }
    }
    return buf;
  }

  loop(buffer, rate = 1) {
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    src.playbackRate.value = rate;
    src.start(this.ctx.currentTime, Math.random() * buffer.duration);
    return src;
  }

  filter(type, freq, q = 0.7) {
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    return f;
  }

  pan(value) {
    const p = this.ctx.createStereoPanner();
    p.pan.value = value;
    return p;
  }

  /** İki bağımsız esinti: biri solda biri sağda, her biri kendi soluğunda. */
  buildWind() {
    this.gusts = [-0.45, 0.45].map((side, i) => {
      const src = this.loop(i ? this.pink : this.brown, i ? 0.71 : 1.13);
      const lp = this.filter('lowpass', 420, 0.6);
      // Pembe gürültünün üst ucu ayrıca kesilir: ıslık yok.
      const top = this.filter('lowpass', 1100, 0.5);
      const g = this.ctx.createGain();
      g.gain.value = 0.3;
      src.connect(lp).connect(top).connect(g).connect(this.pan(side)).connect(this.windBus);
      return { lp, g, trim: i ? 0.35 : 1 };
    });
  }

  /** Deniz: dipte kabarma (kahverengi), üstünde köpük (pembe, bant süzgeçli). */
  buildSea() {
    this.swells = [-0.35, 0.35].map((side, i) => {
      const surge = this.loop(this.brown, i ? 0.87 : 1.04);
      const surgeLp = this.filter('lowpass', 360, 0.6);
      const surgeG = this.ctx.createGain();
      surgeG.gain.value = 0.15;
      const foam = this.loop(this.pink, i ? 0.93 : 1.08);
      const foamBp = this.filter('bandpass', 650, 0.55);
      const foamLp = this.filter('lowpass', 1500, 0.5);
      const foamG = this.ctx.createGain();
      foamG.gain.value = 0.02;
      const p = this.pan(side);
      surge.connect(surgeLp).connect(surgeG).connect(p);
      foam.connect(foamBp).connect(foamLp).connect(foamG).connect(p);
      p.connect(this.seaBus);
      return { surgeG, foamG, surgeLp };
    });
  }

  /** Cephenin uğultusu: duyulmaktan çok hissedilen, 110 Hz altı. */
  buildFrontBed() {
    const src = this.loop(this.brown, 0.8);
    const lp = this.filter('lowpass', 110, 0.5);
    this.bedGain = this.ctx.createGain();
    this.bedGain.gain.value = 0;
    src.connect(lp).connect(this.bedGain).connect(this.frontBus);
  }

  // ---- hedefler ------------------------------------------------------------

  /**
   * Hedefler 0..1. fronts: kulak menzilindeki muharebe sayısı (sıklığı
   * belirler), front: en yakınının ve kameranın verdiği düzey.
   */
  set(levels, now = this.ctx.currentTime) {
    const prev = this.levels;
    this.levels = { ...prev, ...levels };
    const L = this.levels;
    const ramp = (param, value, tau = LAYER_TAU) => param.setTargetAtTime(value, now, tau);
    // Katsayılar ölçümle (scripts/ui/ambience-levels.plan.mjs): barış eski
    // kayıtların RMS'inin altında, savaş ancak birkaç dB üstünde.
    if (L.wind !== prev.wind) ramp(this.windBus.gain, 0.28 * L.wind);
    if (L.sea !== prev.sea) ramp(this.seaBus.gain, 0.6 * L.sea);
    if (L.country !== prev.country) ramp(this.countryBus.gain, L.country);
    const front = Math.max(L.front, 0.45 * L.naval);
    if (front !== Math.max(prev.front, 0.45 * prev.naval)) {
      ramp(this.frontBus.gain, front > 0.005 ? 1 : 0, FRONT_TAU);
      ramp(this.bedGain.gain, 0.3 * L.front, FRONT_TAU);
    }
  }

  // ---- olaylar ---------------------------------------------------------------

  /** Olayları ses saatinde `until`a dek yazar. Kaçırılan geçmiş atlanır. */
  pump(until) {
    const now = this.ctx.currentTime;
    const from = Math.max(this.pumpedTo, now + 0.05);
    this.voices = this.voices.filter((v) => v.end > now);
    this.stream('gust', from, until, () => rand(3, 7), (t) => this.gust(t));
    this.stream('wave', from, until, () => rand(6.5, 11), (t) => this.wave(t));
    const L = this.levels;
    if (L.country > 0.01) {
      this.stream('bird', from, until, () => rand(5, 13) / (0.4 + L.country), (t) => this.birdPhrase(t));
    } else this.next.bird = null;
    const front = Math.max(L.front, 0.45 * L.naval);
    if (front > 0.01) {
      // Sıklık muharebe sayısıyla artar ama doyar: on muharebe on kat değil.
      const n = Math.max(1, L.fronts);
      const perSec = Math.min(0.9, 0.14 + 0.1 * Math.log2(1 + n) + 0.2 * front);
      this.stream('cannon', from, until, () => -Math.log(1 - Math.random()) / perSec + 0.25, (t) => this.cannon(t, front));
      if (L.front > 0.18) {
        this.stream('crackle', from, until, () => rand(2.5, 7) / (0.5 + L.front), (t) => this.crackle(t, L.front));
      } else this.next.crackle = null;
    } else {
      this.next.cannon = null;
      this.next.crackle = null;
    }
    this.pumpedTo = Math.max(this.pumpedTo, until);
  }

  stream(name, from, until, gap, fire) {
    let t = this.next[name];
    if (t == null || t < from) t = from + gap() * Math.random();
    while (t < until) {
      fire(t);
      t += gap();
    }
    this.next[name] = t;
  }

  /** t anında çalan ses sayısı tavandaysa yeni ses yazılmaz. */
  voice(t, length) {
    let alive = 0;
    for (const v of this.voices) if (v.start <= t && v.end > t) alive++;
    if (alive >= MAX_VOICES) {
      this.counts.skipped++;
      return false;
    }
    this.voices.push({ start: t, end: t + length });
    return true;
  }

  /** Konsol/sınama: şu an çalan olay sesi sayısı. */
  playing(t = this.ctx.currentTime) {
    let n = 0;
    for (const v of this.voices) if (v.start <= t && v.end > t) n++;
    return n;
  }

  /** Esinti: kazanç ve süzgeç birlikte yavaşça kabarır. */
  gust(t) {
    this.counts.gust++;
    for (const w of this.gusts) {
      const strength = Math.random();
      w.g.gain.setTargetAtTime((0.22 + 0.5 * strength) * w.trim, t, rand(1.2, 2.6));
      w.lp.frequency.setTargetAtTime(300 + 520 * strength, t, rand(1.5, 3));
    }
  }

  /** Dalga: 2.5-4 s kabarır, 4-6 s çekilir; köpük tepeyi biraz gecikmeli izler. */
  wave(t) {
    this.counts.wave++;
    const s = this.swells[Math.random() < 0.5 ? 0 : 1];
    const rise = rand(2.5, 4);
    const fall = rand(4, 6);
    const peak = rand(0.6, 1);
    s.surgeG.gain.setTargetAtTime(0.15 + 0.55 * peak, t, rise / 3);
    s.surgeG.gain.setTargetAtTime(0.15, t + rise, fall / 3);
    s.surgeLp.frequency.setTargetAtTime(300 + 160 * peak, t, rise / 3);
    s.surgeLp.frequency.setTargetAtTime(300, t + rise, fall / 3);
    s.foamG.gain.setTargetAtTime(0.02 + 0.16 * peak, t + rise * 0.7, 0.8);
    s.foamG.gain.setTargetAtTime(0.02, t + rise + 0.6, fall / 2.5);
  }

  /**
   * Uzak kuş: çoğunlukla güvercin ötüşü (450-620 Hz, yumuşak), arada bir
   * süzgeçten geçmiş kısa cıvıltı. Tiz cıvıltı dizisi bilerek seyrek ve kısık.
   */
  birdPhrase(t) {
    this.counts.bird++;
    const { ctx } = this;
    const dove = Math.random() < 0.7;
    const p = this.pan(rand(-0.7, 0.7));
    const lp = this.filter('lowpass', dove ? 1400 : 2600, 0.5);
    lp.connect(p).connect(this.countryBus);
    if (dove) {
      const base = rand(450, 560);
      const notes = Math.random() < 0.5 ? [0.32, 0.55, 0.3] : [0.4, 0.3, 0.3, 0.5];
      let at = t;
      for (let i = 0; i < notes.length; i++) {
        const len = notes[i];
        if (!this.voice(at, len + 0.2)) break;
        const o = ctx.createOscillator();
        o.type = 'sine';
        const f = base * (i === 1 ? 1.08 : 1);
        o.frequency.setValueAtTime(f * 1.03, at);
        o.frequency.exponentialRampToValueAtTime(f * 0.94, at + len);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, at);
        g.gain.linearRampToValueAtTime(0.05, at + 0.09);
        g.gain.setTargetAtTime(0, at + len * 0.6, len / 4);
        o.connect(g).connect(lp);
        o.start(at);
        o.stop(at + len + 0.3);
        at += len + rand(0.12, 0.22);
      }
    } else {
      const base = rand(1900, 2500);
      const n = 2 + Math.floor(Math.random() * 3);
      let at = t;
      for (let i = 0; i < n; i++) {
        if (!this.voice(at, 0.2)) break;
        const o = ctx.createOscillator();
        o.type = 'sine';
        o.frequency.setValueAtTime(base, at);
        o.frequency.exponentialRampToValueAtTime(base * rand(1.08, 1.2), at + 0.07);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, at);
        g.gain.linearRampToValueAtTime(0.012, at + 0.02);
        g.gain.setTargetAtTime(0, at + 0.05, 0.025);
        o.connect(g).connect(lp);
        o.start(at);
        o.stop(at + 0.2);
        at += rand(0.13, 0.22);
      }
    }
  }

  /**
   * Uzak top: 40-60 Hz'lik gövde + alçak süzülmüş gürültüden yuvarlanan yankı.
   * Açılış 60-110 ms: uzaktan gelen vuruş yayılarak gelir; 25 ms'lik ilk
   * denemede 10 ms'lik pencere bir önceki 200 ms'nin 14.7 dB üstüne
   * sıçrıyordu (ölçüldü). Uzaklık süzgeci düzeyle kapanır (uzak = boğuk).
   */
  cannon(t, level) {
    const tail = rand(1.6, 2.6);
    if (!this.voice(t, tail)) return;
    this.counts.cannon++;
    const { ctx } = this;
    const near = clamp01(level);
    // 0.22 → 0.11: ilk ayarda savaş RMS'i eski kaydın ~6 dB üstündeydi; Kerem "kulak siken
    // tarzdan olmasın" dedi. Yarı genlik ≈ −6 dB, eski düzeyle aynı.
    const amp = 0.11 * (0.35 + 0.65 * near) * rand(0.55, 1);
    const p = this.pan(rand(-0.6, 0.6));
    p.connect(this.frontBus);
    const attack = rand(0.06, 0.11);

    const o = ctx.createOscillator();
    o.type = 'sine';
    const f = rand(44, 60);
    o.frequency.setValueAtTime(f, t);
    o.frequency.exponentialRampToValueAtTime(f * 0.62, t + 0.5);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0, t);
    og.gain.linearRampToValueAtTime(0.5 * amp, t + attack);
    og.gain.setTargetAtTime(0, t + attack, rand(0.18, 0.3));
    o.connect(og).connect(p);
    o.start(t);
    o.stop(t + tail);

    const n = ctx.createBufferSource();
    n.buffer = this.brown;
    const lp = this.filter('lowpass', 120 + 200 * near, 0.6);
    lp.frequency.setTargetAtTime(90, t + 0.15, 0.6);
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0, t);
    ng.gain.linearRampToValueAtTime(0.9 * amp, t + attack * 1.4);
    ng.gain.setTargetAtTime(0, t + attack * 1.4, tail / 4);
    n.connect(lp).connect(ng).connect(p);
    n.start(t, Math.random() * (this.brown.duration - tail - 0.1), tail);
  }

  /** Seyrek tüfek çıtırtısı: 3-9 kısa, kısık, bant süzgeçli gürültü tanesi. */
  crackle(t, level) {
    const { ctx } = this;
    const shots = 3 + Math.floor(Math.random() * 7);
    const bp = this.filter('bandpass', rand(700, 1100), 1.1);
    const p = this.pan(rand(-0.7, 0.7));
    bp.connect(p).connect(this.frontBus);
    let at = t;
    let fired = 0;
    for (let i = 0; i < shots; i++) {
      if (!this.voice(at, 0.12)) break;
      fired++;
      const n = ctx.createBufferSource();
      n.buffer = this.pink;
      const g = ctx.createGain();
      const amp = 0.05 * clamp01(level) * rand(0.4, 1);
      g.gain.setValueAtTime(0, at);
      g.gain.linearRampToValueAtTime(amp, at + 0.004);
      g.gain.setTargetAtTime(0, at + 0.006, 0.018);
      n.connect(g).connect(bp);
      n.start(at, Math.random() * (this.pink.duration - 0.2), 0.1);
      at += rand(0.06, 0.45);
    }
    if (fired) this.counts.crackle++;
  }
}
