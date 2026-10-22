// Dinamik savaş müziği: ağır gitar + orkestra perküsyonu (CoD: World at War damarı).
//
// İki girdi müziği sürer:
//   yoğunluk (0..1) — savaşın büyüklüğü: hangi bölükler çalıyor
//                     (davul → gitar duvarı + bas + kick → trampet → lead)
//   mikro    (0..1) — oyuncunun el hızı (dakikadaki tık/tuş): tempo 118→136,
//                     çug sekizlikten dörtnala, sonra düz onaltılığa; vuruşlar
//                     3+3+2 senkopa kayar; en üstte double kick. Oyuncu
//                     hızlandıkça orkestra da koşar.
//
// Ses dili: Alman tarafı düz çug (endüstriyel), Sovyet tarafı armonik minör
// marş teması. 2026-10-22'de Kerem'in kulağıyla çıkanlar: pirinç, uzun
// yaylılar ve keman ostinatosu (mobil oyun gibi), sahra trampetinin süs
// vuruşları ("Müttefik"), ziller (crash, kreşendo, gong: işe yaramıyordu),
// örs ("ting ting, zil sesi gibi": enerjisi 5.6-10 kHz'de tek perdeli tepeler).
//
// Partisyon 16'lık adımlarla yazılıdır ve her adım ayrı zamanlanır; tempo ve
// yoğunluk ölçü ortasında bile değişebilir. Zamanlayıcı, el hızı ölçeri ve
// WAV dökümü ortak motordadır (musicEngine.js); canlı ve döküm aynı
// `scheduleStep`i kullanır.
//
// Gitar ve bas gerçek DI kayıt (Karoryfer, CC0), amfiden geçer (guitar.js).
// Mi minör: gitar kayıtları E2'den başlar; çug boş Mi telinde, perde
// kaydırmadan çalar (kaydırma pirinci yapay yapan şeylerden biriydi).
// Döngü: Em Em C D | Em C Am/B B. Final (`stinger`) E5.

import { loadOrchestra } from './orchestra.js';
import { makeAmp, makeBassAmp } from './guitar.js';
import { clamp01, makeMixer, ramp, rng, setFaders } from './musicEngine.js';

const CHORDS = {
  Em: [52, 55, 59],
  C: [48, 52, 55],
  D: [50, 54, 57],
  Am: [45, 48, 52],
  B: [47, 51, 54],
};

// Ölçü başına akor; iki öğe = yarım ölçü.
const PROGRESSION = [['Em'], ['Em'], ['C'], ['D'], ['Em'], ['C'], ['Am', 'B'], ['B']];

// Tema (armonik minör, Re# yeden): [ölçü, vuruş, süre(vuruş), MIDI]. Lead gitar.
const THEME = [
  [2, 0, 1.5, 76], [2, 1.5, 0.5, 74], [2, 2, 1, 72], [2, 3, 1, 71],
  [3, 0, 1.5, 69], [3, 1.5, 0.5, 71], [3, 2, 1, 74], [3, 3, 1, 78],
  [4, 0, 3, 79], [4, 3, 0.5, 78], [4, 3.5, 0.5, 76],
  [5, 0, 1.5, 76], [5, 1.5, 0.5, 79], [5, 2, 1, 76], [5, 3, 1, 72],
  [6, 0, 1, 72], [6, 1, 1, 76], [6, 2, 1, 75], [6, 3, 1, 78],
  [7, 0, 2, 78], [7, 2, 1, 75], [7, 3, 1, 71],
];

// Çug: boş Mi teli + beşlisi + oktavı, kısa (staccato) çalım.
const PEDAL = [40, 47, 52];
// Power chord: kök + beşli + oktav, kök 40-51 aralığına (gitarın alt telleri).
const power = (root) => {
  const r = root < 40 ? root + 12 : root > 51 ? root - 12 : root;
  return [r, r + 7, r + 12];
};
const GALLOP = new Set([0, 2, 3, 4, 6, 7, 8, 10, 11, 12, 14, 15]);

// Form. İlk sürüm döngüyü birebir tekrarlıyordu (iki geçiş arası 0.5 dB fark)
// ve yoğun bölümde sesi hiç inip çıkmayan bir duvardı (dinamik 1.3 dB): ikisi
// de mobil oyun müziğinin imzası. Döngü içinde bir yay var (girişte yalın,
// ortada dolu, sonda kırılma); geçişler de birbirinden farklı çalar.
// Ritim bölüklerinin döngüdeki enerji yayı (ölçü başına çarpan):
const ENERGY = [0.45, 0.6, 0.85, 0.92, 1, 1, 0.8, 0.9];

/** Bölüklerin yoğunluğa göre ses düzeyi. Eşikler kademeli girişi verir. */
export function layerLevels(I) {
  return {
    // Davul baştan beri çalar ama tam gücü sona saklar: doruk kazanılmalı.
    drums: 0.55 + 0.45 * ramp(I, 0.2, 0.95),
    kick: ramp(I, 0.15, 0.4),
    gtr: ramp(I, 0.2, 0.55),
    bass: ramp(I, 0.15, 0.45),
    snare: ramp(I, 0.25, 0.45),
    lead: ramp(I, 0.5, 0.7),
  };
}

export const tempoFor = (micro) => 118 + 18 * micro;

/** Timpani akorun kökünü 41-55 aralığında çalar; kayıtlar orada. */
const timpNote = (root) => (root < 41 ? root + 12 : root);

// Bölük → [düzey, yankı payı]. Ölçümle dengelendi (render-battle.mjs --stems).
// Metal gitar ve bas kuru kalır (yankı çamurlaştırır), trampet büyük salonda.
const BUSES = {
  drums: [1.65, 0.25],
  kick: [0.9, 0.04],
  gtr: [0.35, 0.1],
  bass: [0.9, 0],
  snare: [2.4, 0.4],
  lead: [0.63, 0.3],
};

/** Ortak karıştırıcı + gitar/bas/lead amfileri. */
function buildMixer(ctx, dest) {
  const { master, bus } = makeMixer(ctx, dest, BUSES);
  // Gitarlar: sol ve sağ AYRI amfi, ayrı çalım (çift kayıt). Aynı sinyali
  // iki yana bölmek tek gitar verir; duvar iki farklı çalımdan doğar.
  const side = (pan) => {
    const amp = makeAmp(ctx);
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    amp.output.connect(p).connect(bus.gtr.input);
    return amp;
  };
  const gtrL = side(-0.85);
  const gtrR = side(0.85);
  const bassAmp = makeBassAmp(ctx);
  bassAmp.output.connect(bus.bass.input);
  const leadAmp = makeAmp(ctx, { lead: true });
  leadAmp.output.connect(bus.lead.input);
  // Lead gecikmesi (noktalı sekizlik civarı): solo gitarın "uzayan" kuyruğu.
  const echo = ctx.createDelay(1);
  echo.delayTime.value = 0.34;
  const fb = ctx.createGain();
  fb.gain.value = 0.3;
  const echoTone = ctx.createBiquadFilter();
  echoTone.type = 'lowpass';
  echoTone.frequency.value = 3000;
  const echoOut = ctx.createGain();
  echoOut.gain.value = 0.35;
  leadAmp.output.connect(echo).connect(echoTone).connect(fb).connect(echo);
  echoTone.connect(echoOut).connect(bus.lead.input);

  return { master, bus, gtrL, gtrR, bassIn: bassAmp.input, leadIn: leadAmp.input };
}

const kickNoise = new WeakMap();

/**
 * Metal kick: sentez (VSCO'da rock kick yok; konser bas davulu double kick
 * için fazla uzun çınlar). Sinüs gövde perdesi düşer, üstte tokmak tıkı.
 */
export function metalKick(ctx, out, t, vel) {
  const o = ctx.createOscillator();
  o.frequency.setValueAtTime(190, t);
  o.frequency.exponentialRampToValueAtTime(52, t + 0.045);
  o.frequency.exponentialRampToValueAtTime(45, t + 0.3);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vel, t + 0.002);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
  o.connect(g).connect(out);
  o.start(t);
  o.stop(t + 0.34);

  let nb = kickNoise.get(ctx);
  if (!nb) {
    nb = ctx.createBuffer(1, Math.round(ctx.sampleRate * 0.03), ctx.sampleRate);
    const d = nb.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    kickNoise.set(ctx, nb);
  }
  const n = ctx.createBufferSource();
  n.buffer = nb;
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 2500;
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(vel * 0.6, t);
  ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.015);
  n.connect(hp).connect(ng).connect(out);
  n.start(t);
}

/**
 * Partisyonun kendisi: bir adımı verilen zamana yazar. Saat tutmaz;
 * zamanı canlı yönetmen ya da çevrimdışı döküm verir.
 */
export class BattleScore {
  /** Çözülecek enstrümanlar (bkz. orchestra.js: tembel çözme, bellek). */
  static INSTRUMENTS = ['bdrum', 'taiko', 'taikoHi', 'snare', 'timp', 'gtr', 'gtrMute', 'lead', 'bass', 'bassMute'];
  static BARS = PROGRESSION.length;
  static tempoFor = tempoFor;
  static layerLevels = layerLevels;

  static async create(ctx, dest, opts) {
    return new BattleScore(ctx, dest, await loadOrchestra(ctx, BattleScore.INSTRUMENTS), opts);
  }

  constructor(ctx, dest, orchestra, { seed = 1836 } = {}) {
    this.ctx = ctx;
    this.orc = orchestra;
    Object.assign(this, buildMixer(ctx, dest));
    this.rand = rng(seed);
  }

  chordAt(bar, step) {
    const names = PROGRESSION[bar % PROGRESSION.length];
    return CHORDS[names[step < 8 || names.length === 1 ? 0 : 1]];
  }

  /**
   * Ritim gitarı: akor tel tel, aşağı vuruşla (açıkta 7 ms, çugda 2 ms arayla).
   * Sol ve sağ ayrı amfi; sıradaki çalım (round robin) sağa düşer, sağ birkaç
   * ms geride — gerçek çift kayıttaki iki ayrı insan çalımı.
   */
  guitars(t, midis, inst, { vel, ...o }) {
    const muted = inst === 'gtrMute';
    const strum = muted ? 0.002 : 0.007;
    const each = vel / Math.sqrt(midis.length);
    for (const [amp, lag] of [[this.gtrL, 0], [this.gtrR, 0.006 + 0.008 * this.rand()]]) {
      // Çug notası palm mute yolundan girer (bkz. guitar.js makeAmp).
      const side = muted ? amp.muteInput : amp.input;
      midis.forEach((m, k) => this.orc.play(inst, side, t + lag + k * strum, { ...o, midi: m, vel: each, jitter: 0.002 }));
    }
  }

  /** Bas gitar ritim gitarına kilitli çalar. */
  bass(t, midi, inst, o) {
    this.orc.play(inst, this.bassIn, t, { ...o, midi, jitter: 0.002 });
  }

  /**
   * @param t      adımın ctx zamanı
   * @param dt     bir 16'lığın süresi (sn)
   * @param bar    mutlak ölçü sayacı (döngüdeki yer bar % 8, geçiş bar / 8)
   * @param step   0-15
   * @param I      yoğunluk 0..1
   * @param micro  el hızı 0..1
   */
  scheduleStep(t, dt, bar, step, I, micro) {
    const { ctx, orc, bus } = this;
    const play = (inst, b, o) => orc.play(inst, bus[b].input, t, o);
    const chord = this.chordAt(bar, step);
    const root = chord[0];
    const beat = dt * 4;
    const r = this.rand;
    const loopBar = bar % 8;
    const pass = Math.floor(bar / 8);
    // Kırılma: tek geçişlerin son ölçüsünde tek vuruş, ~0.6 sn gerçek sessizlik,
    // sonra yalnız davul dolgusu döngü başına taşır.
    const breakBar = loopBar === 7 && pass % 2 === 1;
    // Yalın giriş: ilk geçişten sonra döngü başı çugsuz, seyrek vuruş.
    const lean = pass > 0 && loopBar < 2;
    // B bölümü: her üç geçişten birinde ortadaki dört ölçüde çug yok; power
    // chord'lar yarım ölçü çınlar, kick dörtlük. İlk denemede yalnız vuruş
    // seyreltilmişti ve gitar duvarının altında duyulmadı (geçiş farkı 1.6 dB).
    const halfTime = pass % 3 === 1 && loopBar >= 2 && loopBar <= 5;

    const base = layerLevels(I);
    const e = ENERGY[loopBar];
    const lv = { ...base, gtr: base.gtr * e, bass: base.bass * e, kick: base.kick * e };
    setFaders(bus, lv, t);

    // Riff: vuruşlar (açık power chord) ve aralarında boş Mi teli çugu.
    // El hızı: sekizlik → dörtnal → düz onaltılık; vuruşlar 1-3'ten 3+3+2'ye.
    const stabs = halfTime ? [0, 8] : lean ? (loopBar === 0 ? [0] : [0, 8]) : micro > 0.35 ? [0, 6, 12] : [0, 8];
    let isStab = stabs.includes(step);
    let isChug = !isStab && !lean && !halfTime && (micro > 0.75 || (micro > 0.35 ? GALLOP.has(step) : step % 2 === 0));
    if (breakBar) {
      isStab = step === 0;
      isChug = false;
    }
    if (lv.gtr > 0 && isStab) {
      const pc = power(root);
      // B bölümünde ve seyrek girişte vuruş çınlar; kırılmada kısa kesilir, ardı sessizlik.
      const hold = breakBar ? dt * 2.5 : halfTime ? dt * 7.5 : lean ? dt * 4 : dt * 2;
      const rel = halfTime || lean ? 0.25 : 0.05;
      this.guitars(t, pc, 'gtr', { vel: 0.95, dur: hold - 0.01, release: rel });
      this.bass(t, pc[0] - 12, 'bass', { vel: 1, dur: hold, release: rel });
    } else if (lv.gtr > 0 && isChug) {
      const v = (step % 4 === 0 ? 0.95 : 0.8) * (0.93 + 0.07 * r());
      this.guitars(t, PEDAL, 'gtrMute', { vel: v, dur: dt * 0.95, release: 0.03 });
      this.bass(t, 28, 'bassMute', { vel: v, dur: dt * 0.95, release: 0.03 });
    }

    // Kick riffe kilitli; en yüksek el hızında her onaltılık (double kick).
    if (lv.kick > 0 && !(breakBar && step > 0)) {
      if (halfTime) {
        if (step % 4 === 0) metalKick(ctx, bus.kick.input, t, step % 8 ? 0.8 : 1);
      } else if (isStab || (isChug && micro > 0.45)) metalKick(ctx, bus.kick.input, t, step % 2 ? 0.8 : 1);
      else if (step % 8 === 0 && !lean) metalKick(ctx, bus.kick.input, t, 1);
    }

    // Sinema davulları: ölçü başında bas davul + taiko, yarıda taiko.
    if (step === 0 || (step === 8 && I > 0.3 && !breakBar)) {
      play('taiko', 'drums', { vel: step ? 0.75 : 1, layer: 1, pan: -0.15 });
      if (I > 0.5) orc.play('taiko', bus.drums.input, t + 0.008 + 0.012 * r(), { vel: 0.7, layer: 1, pan: 0.25 });
    }
    if (step === 0 && I > 0.45) play('bdrum', 'drums', { vel: 0.5 + 0.5 * I, layer: I > 0.8 ? 1 : 0 });
    if (I > 0.5 && micro > 0.6 && !lean && !breakBar && (step === 7 || step === 15)) play('taikoHi', 'drums', { vel: 0.4, layer: 0, pan: 0.3 });

    // Trampet: 2 ve 4'te büyük backbeat; tek geçişlerin girişinde yarım zaman
    // (yalnız 3. vuruş). Döngü sonunda dolgu: kırılmada yarım ölçü boyu
    // kreşendo onaltılık, öbür geçişlerde son vuruş.
    if (lv.snare > 0) {
      const halfSnare = pass % 2 === 1 && loopBar < 2;
      const back = halfSnare ? step === 8 : step === 4 || step === 12;
      if (breakBar) {
        if (step >= 10) play('snare', 'snare', { vel: 0.4 + 0.1 * (step - 10), layer: step > 12 ? 2 : 1, jitter: 0.004 });
      } else if (back) play('snare', 'snare', { vel: 1, layer: 2, jitter: 0.004 });
      else if (loopBar === 7 && step > 12) play('snare', 'snare', { vel: 0.55 + 0.1 * (step - 12), layer: 1, jitter: 0.004 });
    }

    // Timpani akor başlarında; Am/B ölçüsünde gürleyen tremolo.
    if (I > 0.45) {
      if (step === 0) play('timp', 'drums', { midi: timpNote(root), vel: 0.7, layer: 1 });
      if (loopBar >= 6 && step >= (breakBar ? 10 : 8)) {
        for (let k = 0; k < 2; k++) {
          const v = 0.25 + 0.55 * ((step - 8 + k / 2) / 8) + (loopBar === 7 ? 0.15 : 0);
          orc.play('timp', bus.drums.input, t + (k * dt) / 2, { midi: 47, vel: v, layer: v > 0.55 ? 1 : 0 });
        }
      }
    }

    // Lead gitar: armonik minör marş teması; doruğa yakın bir oktav altı katılır.
    // Geçişe göre: bir geçişte tema yalnız alt oktavda (koyu), bir geçişte ilk
    // yarısı susar ve gitar duvarı tek başına kalır; tema dorukta geri gelir.
    const leadMode = pass % 3;
    if (lv.lead > 0 && !(leadMode === 2 && loopBar < 4)) {
      for (const [b, at, len, m] of THEME) {
        if (b !== loopBar || Math.round(at * 4) !== step) continue;
        const dur = len * beat + 0.02;
        if (leadMode === 1) {
          orc.play('lead', this.leadIn, t, { midi: m - 12, vel: 0.95, dur, release: 0.12, jitter: 0.004 });
          continue;
        }
        orc.play('lead', this.leadIn, t, { midi: m, vel: 0.9, dur, release: 0.12, jitter: 0.004 });
        if (I > 0.85) orc.play('lead', this.leadIn, t + 0.01, { midi: m - 12, vel: 0.55, dur, release: 0.12, jitter: 0.004 });
      }
    }

  }

  /** Savaş sonu darbesi: Mi power chord çınlar, bütün davullar birden. */
  stinger(t, I = 1) {
    const { ctx, orc, bus } = this;
    setFaders(bus, layerLevels(Math.max(I, 0.95)), t - 0.05, 0.05);
    const play = (inst, b, o) => orc.play(inst, bus[b].input, t, o);
    const hold = 2.4;
    this.guitars(t, [40, 47, 52], 'gtr', { vel: 1, dur: hold, release: 0.6 });
    this.bass(t, 28, 'bass', { vel: 1, dur: hold, release: 0.6 });
    metalKick(ctx, bus.kick.input, t, 1);
    play('bdrum', 'drums', { vel: 1, layer: 1 });
    play('taiko', 'drums', { vel: 1, layer: 1 });
    play('timp', 'drums', { midi: 52, vel: 1, layer: 1 });
    play('snare', 'snare', { vel: 1, layer: 2 });
  }
}

/**
 * 34 saniyelik savaş gösterisi: iki döngü geçişi. İlk geçişte yoğunluk 0.25'ten
 * 1'e, el hızı 0.3'ten 0.95'e tırmanır (tempo ~123 → ~135); ikinci geçiş
 * farklı çalar (yalın giriş, yarım zaman, alt oktav tema, kırılma), sonra final.
 */
export const BATTLE_DEMO = {
  bars: 16,
  seconds: 34,
  level: (x) => [0.25, 0.4, 0.55, 0.62, 0.86, 0.95, 1][Math.min(6, Math.floor(x))],
  micro: (x) => 0.3 + 0.65 * clamp01(x / 6.5),
};
