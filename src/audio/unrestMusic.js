// Kargaşa müziği: halk hareketleri, krizler, ayaklanma için.
//
// Tek girdi `level` = HUZURSUZLUK (0..1):
//   0     tedirgin ostinato (piyano, 3+3+3+3+4 vurgulu), kemanın kromatik inen
//         uzun sesleri, Mi pedalı
//   →0.4  bas ve kısık gitar pedalda kıpırdar, taiko tıkırtısı, alçak piyano kümeleri
//   →0.7  ostinato onaltılıkla dolar, keman yarım ses sürtünen tremoloya geçer,
//         Mi-Fa çug riffi (bozulmuş gitar) — ayaklanma
// El hızı: tempo 108→122.
//
// Mi Frig (Mi minörün ikincisi pes: Fa): Mi ile Fa arasındaki yarım ses hiç
// çözülmez; huzursuzluk bu sürtünmeden gelir. Döngü: Em | F | Em | F | Am | Bb | B | Em.
// Geçişler: ostinato tam / yarım (yalnız vurgular, keman susar) / ters (yarım ses aşağı).

import { loadOrchestra } from './orchestra.js';
import { makeAmp, makeBassAmp } from './guitar.js';
import { clamp01, makeMixer, ramp, rng, setFaders } from './musicEngine.js';

const BARS = [
  { bass: 28, root: 40, tones: [52, 55, 59], cry: 79 }, // Em
  { bass: 29, root: 41, tones: [53, 57, 60], cry: 77 }, // F
  { bass: 28, root: 40, tones: [52, 55, 59], cry: 76 }, // Em
  { bass: 29, root: 41, tones: [53, 57, 60], cry: 77 }, // F
  { bass: 33, root: 45, tones: [57, 60, 64], cry: 76 }, // Am
  { bass: 34, root: 46, tones: [53, 58, 62], cry: 74 }, // Bb
  { bass: 35, root: 47, tones: [54, 59, 63], cry: 75 }, // B
  { bass: 28, root: 40, tones: [52, 55, 59], cry: 76 }, // Em
];

// 16 adımda 3+3+3+3+4: kare ölçüye oturmayan vurgu, dinleyeni hep tetikte tutar.
const ACCENTS = new Set([0, 3, 6, 9, 12]);
// İkinci geçişte vurgu 3+3+2 | 3+3+2: aynı tedirginlik, başka yerden; vurgu
// deseni aynı kalınca iki geçişin ritim zarfı 0.87-0.92 benzer ölçüldü.
const ACCENTS_B = new Set([0, 3, 6, 8, 11, 14]);
// Döngü içi enerji yayı. İlk sürümde sabit huzursuzlukta iki geçiş neredeyse
// aynıydı (ritim benzerliği 0.77, aynı-döngü tabanı 0.90) ve ses duvardı
// (dinamik 1.7 dB) — mobil oyun hissi.
const ENERGY = [0.45, 0.6, 0.85, 1, 0.7, 0.85, 1, 0.9];
const timpNote = (m) => (m < 41 ? m + 12 : m > 55 ? m - 12 : m);

export function layerLevels(L) {
  return {
    ost: 0.85,
    vln: 1 - 0.7 * ramp(L, 0.6, 0.8),
    trem: ramp(L, 0.6, 0.8),
    bass: ramp(L, 0.25, 0.45),
    mute: ramp(L, 0.3, 0.5),
    drums: ramp(L, 0.2, 0.5),
    gtr: ramp(L, 0.7, 0.88),
  };
}

export const tempoFor = (micro) => 108 + 14 * micro;

// Bölük → [düzey, yankı payı]. Ölçümle dengelendi (render-music.mjs kargasa --stems).
const BUSES = {
  ost: [0.9, 0.3],
  vln: [1.5, 0.5],
  trem: [1.0, 0.4],
  bass: [0.9, 0.05],
  mute: [0.5, 0.1],
  drums: [1.7, 0.3],
  gtr: [0.35, 0.1],
};

function buildMixer(ctx, dest) {
  const { master, bus } = makeMixer(ctx, dest, BUSES);
  const side = (pan) => {
    const amp = makeAmp(ctx);
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    amp.output.connect(p).connect(bus.gtr.input);
    return amp;
  };
  const muteAmp = makeAmp(ctx);
  muteAmp.output.connect(bus.mute.input);
  const bassAmp = makeBassAmp(ctx);
  bassAmp.output.connect(bus.bass.input);
  return { master, bus, gtrL: side(-0.8), gtrR: side(0.8), muteIn: muteAmp.muteInput, bassIn: bassAmp.input };
}

export class UnrestScore {
  /** Çözülecek enstrümanlar (bkz. orchestra.js: tembel çözme, bellek). */
  static INSTRUMENTS = ['piano', 'pianoLow', 'vln', 'vlnTrem', 'gtrMute', 'bassMute', 'bass', 'taikoHi', 'taiko', 'timp', 'gtr'];
  static BARS = BARS.length;
  static tempoFor = tempoFor;
  static layerLevels = layerLevels;

  static async create(ctx, dest, opts) {
    return new UnrestScore(ctx, dest, await loadOrchestra(ctx, UnrestScore.INSTRUMENTS), opts);
  }

  constructor(ctx, dest, orchestra, { seed = 1848 } = {}) {
    this.ctx = ctx;
    this.orc = orchestra;
    Object.assign(this, buildMixer(ctx, dest));
    this.rand = rng(seed);
  }

  /** @param L huzursuzluk 0..1; `bar` mutlak sayaç — diğerleri BattleScore.scheduleStep gibi. */
  scheduleStep(t, dt, bar, step, L, micro) {
    const { orc, bus } = this;
    const loopBar = bar % BARS.length;
    const pass = Math.floor(bar / BARS.length);
    const mode = pass % 3;
    const base = layerLevels(L);
    const e = ENERGY[loopBar];
    const lv = { ...base, ost: base.ost * (0.6 + 0.4 * e), mute: base.mute * e, bass: base.bass * e, gtr: base.gtr * e, drums: base.drums * e };
    setFaders(bus, lv, t);
    // Yalın giriş: ilk geçişten sonra döngü başında pedal ve riff yok.
    const lean = pass > 0 && loopBar < 2;
    // İkinci geçişin ilk yarısı: riff ve alçak kümeler susar, ostinato ile davul kalır.
    const thin = mode === 1 && loopBar < 4;
    const b = BARS[loopBar];
    const beat = dt * 4;
    const r = this.rand;
    const last = loopBar === BARS.length - 1;
    // Kırılma: tek geçişlerin son yarım ölçüsünde yalnız keman ve timpani.
    const breakHalf = last && pass % 2 === 1 && step >= 8;
    const accent = (mode === 1 ? ACCENTS_B : ACCENTS).has(step);

    // Ostinato (piyano): vurgularda kök, aralarda yarım ses üstü (Frig sürtünmesi);
    // üçüncü geçişte ters: yarım ses ALTI. Yarım geçişte yalnız vurgular çalar.
    const fill = mode !== 1 && (L > 0.65 || micro > 0.6);
    if (!breakHalf && (accent || fill)) {
      const hi = b.root + 24;
      const rub = mode === 2 ? hi - 1 : hi + 1;
      const m = accent ? hi : rub;
      orc.play('piano', bus.ost.input, t, { midi: m, layer: accent && L > 0.5 ? 1 : 0, vel: accent ? 0.7 : 0.4, dur: dt * 1.2, release: 0.15, pan: accent ? -0.1 : 0.2, jitter: 0.004 });
    }
    // Alçak küme: kök + yarım ses, ölçü başında (uyumsuz gümbürtü).
    if (step === 0 && L > 0.45 && !breakHalf && !thin) {
      for (const m of [b.root - 12, b.root - 11]) orc.play(['pianoLow', 'piano'], bus.ost.input, t, { midi: m, layer: 1, vel: 0.55 + 0.3 * L, dur: beat * 2, release: 0.8, jitter: 0.006 });
    }

    // Keman: ölçü boyu kromatik inen uzun ses (ağıt değil, inilti); yarım geçişte susar.
    // Hafif kayıt ostinatonun 5 dB altında kalıyordu (ölçüldü): hızı yüksek.
    if (lv.vln > 0 && step === 0 && mode !== 1) {
      orc.play('vln', bus.vln.input, t, { midi: b.cry, layer: L > 0.5 ? 1 : 0, vel: L > 0.5 ? 0.75 : 2.8, dur: beat * (last ? 2 : 4) - 0.05, release: 0.6, jitter: 0.02 });
    }
    // Ayaklanmada keman tremolosu: yarım ölçüde bir yarım ses kayar (sürtünme).
    if (lv.trem > 0 && (step === 0 || step === 8)) {
      orc.play('vlnTrem', bus.trem.input, t, { midi: step ? b.cry + 1 : b.cry, vel: 0.85, dur: beat * 2 + 0.05, release: 0.3, pan: 0.15 });
    }

    // Bas ve kısık gitar: Mi pedalı sekizlik, vurgularda Fa (Frig ikinci derece).
    if (lv.mute > 0 && !breakHalf && !lean && step % 2 === 0) {
      const m = step === 6 || step === 12 ? 41 : 40;
      const v = (accent ? 0.9 : 0.6) * (0.92 + 0.08 * r());
      orc.play('gtrMute', this.muteIn, t, { midi: m, vel: v, dur: dt * 1.4, release: 0.04, jitter: 0.003 });
      orc.play('bassMute', this.bassIn, t, { midi: 28 + (m - 40), vel: v * 0.75, dur: dt * 1.4, release: 0.04, jitter: 0.003 });
    }
    if (step === 0 && lv.bass > 0) orc.play('bass', this.bassIn, t, { midi: b.bass, vel: 0.6, dur: beat * (breakHalf ? 2 : 4) - 0.05, release: 0.5 });

    if (lv.drums > 0 && !breakHalf) {
      // Tıkırtı: vurgularda yüksek taiko; ayaklanmada ölçü başında büyük taiko.
      if (accent) orc.play('taikoHi', bus.drums.input, t, { vel: 0.35 + 0.3 * L, layer: L > 0.6 ? 1 : 0, pan: 0.25, jitter: 0.004 });
      if (step === 0 && L > 0.5) orc.play('taiko', bus.drums.input, t, { vel: 0.7 + 0.3 * L, layer: 1, pan: -0.15 });
    }
    // Döngü sonunda timpani kabarır (kırılmada da: sessizliğin içinde yükselen tehdit).
    if (last && step >= 8 && L > 0.35) {
      for (let k = 0; k < 2; k++) {
        const v = 0.15 + 0.6 * ((step - 8 + k / 2) / 8);
        orc.play('timp', bus.drums.input, t + (k * dt) / 2, { midi: timpNote(b.root), vel: v, layer: v > 0.5 ? 1 : 0 });
      }
    }

    // Ayaklanma riffi: bozulmuş gitarla Mi-Fa çug (ritim gitarı yolu, palm mute).
    if (lv.gtr > 0 && !breakHalf && !lean && !thin && step % 2 === 0) {
      const m = step === 6 || step === 12 ? b.root + 1 : b.root;
      const stab = step === 0;
      for (const [amp, lag] of [[this.gtrL, 0], [this.gtrR, 0.007 + 0.006 * r()]]) {
        const side = stab ? amp.input : amp.muteInput;
        [m, m + 7].forEach((n, k) => orc.play('gtr', side, t + lag + k * 0.003, { midi: n, vel: stab ? 0.6 : 0.5, dur: stab ? dt * 3.5 : dt * 0.95, release: 0.04, jitter: 0.002 }));
      }
    }
  }
}

/**
 * 40 saniyelik gösteri, iki geçiş: tedirginlikten (0.1) ayaklanmaya (0.95). İkinci
 * geçişte ostinato yarıya iner ve keman susar; sonra bozulmuş Mi-Fa riffi girer.
 */
export const UNREST_DEMO = {
  bars: 16,
  seconds: 40,
  level: (x) => Math.min(0.95, 0.1 + 0.06 * Math.floor(x)),
  micro: (x) => 0.2 + 0.5 * clamp01(x / 15),
};
