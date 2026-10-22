// Deniz müziği: donanma ve deniz bölgeleri için.
//
// Tek girdi `level` = DENİZ SAVAŞI (0..1):
//   0     sakin deniz — piyano dalga gibi inip çıkan arpej, uzun bas, keman ezgisi
//   →0.4  timpani iki ölçüde bir kabarıp söner (dalga), taiko ağır kürek vuruşları
//   →0.75 top atışları (bas davul + taiko), gitar duvarı çınlar, keman tremoloya geçer
// El hızı: tempo 76→88, dalga arpeji sekizlikten onaltılığa.
//
// Mi Dor (Mi minörün altıncısı tiz: Do#): açık deniz rengi, minör ama umutlu.
// Döngü (8 ölçü): Em | A | Em | D | C | A | B | Em. Hafif rubato: tempo dalga
// gibi sallanır. Geçişler: ezgi kemanda / piyanoda (keman susar) / ikisinde.

import { loadOrchestra } from './orchestra.js';
import { makeAmp, makeBassAmp } from './guitar.js';
import { clamp01, makeMixer, phraseRubato, ramp, rng, setFaders } from './musicEngine.js';

const BARS = [
  { bass: 28, root: 40, tones: [52, 55, 59] }, // Em
  { bass: 33, root: 45, tones: [57, 61, 64] }, // A
  { bass: 28, root: 40, tones: [52, 55, 59] }, // Em
  { bass: 38, root: 50, tones: [54, 57, 62] }, // D
  { bass: 36, root: 48, tones: [55, 60, 64] }, // C
  { bass: 33, root: 45, tones: [57, 61, 64] }, // A
  { bass: 35, root: 47, tones: [54, 59, 63] }, // B
  { bass: 28, root: 40, tones: [52, 55, 59] }, // Em
];

// Deniz türküsü (Dor: Do#): [ölçü, vuruş, süre(vuruş), MIDI].
const SONG = [
  [0, 0, 1.5, 71], [0, 1.5, 0.5, 76], [0, 2, 2, 78],
  [1, 0, 2, 76], [1, 2, 2, 73],
  [2, 0, 3, 71], [2, 3, 1, 69],
  [3, 0, 2, 66], [3, 2, 2, 69],
  [4, 0, 1.5, 67], [4, 1.5, 0.5, 69], [4, 2, 2, 71],
  [5, 0, 2, 73], [5, 2, 2, 76],
  [6, 0, 2, 75], [6, 2, 2, 78],
  [7, 0, 4, 76],
];

/** Dalga: akor seslerinden kökün bir oktav üstünden başlayıp yükselen, sonra inen 8 nota. */
function wave(b) {
  const pcs = new Set(b.tones.map((m) => m % 12));
  const up = [];
  for (let m = b.root + 12; up.length < 5 && m < b.root + 40; m++) if (pcs.has(m % 12)) up.push(m);
  return [...up, up[3], up[2], up[1]];
}
const timpNote = (m) => (m < 41 ? m + 12 : m > 55 ? m - 12 : m);

export function layerLevels(L) {
  return {
    piano: 1 - 0.3 * ramp(L, 0.6, 1),
    bass: 0.8,
    vln: 1 - 0.6 * ramp(L, 0.65, 0.85),
    trem: ramp(L, 0.65, 0.85),
    drums: ramp(L, 0.25, 0.6),
    gtr: ramp(L, 0.72, 0.9),
  };
}

export const tempoFor = (micro) => 76 + 12 * micro;
/** Dalga gibi sallanan tempo: cümle ortası %5 ileri, sonu %8 geri. */
export const tempoAt = (micro, bar, step) => phraseRubato(tempoFor(micro), bar, step, BARS.length, { push: 0.05, rit: 0.08, endRit: 0.1 });

// Bölük → [düzey, yankı payı]. Ölçümle dengelendi (render-music.mjs deniz --stems).
const BUSES = {
  piano: [0.9, 0.45],
  bass: [0.8, 0.1],
  vln: [1.4, 0.5],
  trem: [1.0, 0.45],
  drums: [1.8, 0.35],
  gtr: [0.35, 0.15],
};

function buildMixer(ctx, dest) {
  const { master, bus } = makeMixer(ctx, dest, BUSES);
  const side = (pan) => {
    const amp = makeAmp(ctx);
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    amp.output.connect(p).connect(bus.gtr.input);
    return amp.input;
  };
  const bassAmp = makeBassAmp(ctx);
  bassAmp.output.connect(bus.bass.input);
  return { master, bus, gtrL: side(-0.8), gtrR: side(0.8), bassIn: bassAmp.input };
}

export class NavalScore {
  /** Çözülecek enstrümanlar (bkz. orchestra.js: tembel çözme, bellek). */
  static INSTRUMENTS = ['piano', 'bass', 'vln', 'vlnTrem', 'timp', 'taiko', 'bdrum', 'gtr'];
  static BARS = BARS.length;
  static tempoFor = tempoFor;
  static tempoAt = tempoAt;
  static layerLevels = layerLevels;

  static async create(ctx, dest, opts) {
    return new NavalScore(ctx, dest, await loadOrchestra(ctx, NavalScore.INSTRUMENTS), opts);
  }

  constructor(ctx, dest, orchestra, { seed = 1905 } = {}) {
    this.ctx = ctx;
    this.orc = orchestra;
    Object.assign(this, buildMixer(ctx, dest));
    this.rand = rng(seed);
  }

  /** @param L deniz savaşı 0..1; `bar` mutlak sayaç — diğerleri BattleScore.scheduleStep gibi. */
  scheduleStep(t, dt, bar, step, L, micro) {
    const { orc, bus } = this;
    const lv = layerLevels(L);
    setFaders(bus, lv, t, 0.6);
    const loopBar = bar % BARS.length;
    const pass = Math.floor(bar / BARS.length);
    const mode = pass % 3;
    const b = BARS[loopBar];
    const beat = dt * 4;
    const r = this.rand;
    const last = loopBar === BARS.length - 1;
    // Nefes: tek geçişlerde son ölçünün ikinci yarısı yalnız bas ve dalganın kuyruğu.
    const breath = last && pass % 2 === 1 && step >= 8;

    // Piyano dalgası: sekizlik; el hızı yüksekse onaltılık (dalga sıklaşır).
    const w = wave(b);
    const sixteenths = micro > 0.5;
    if (!breath && (sixteenths || step % 2 === 0)) {
      const i = sixteenths ? Math.floor(step / 2) : step / 2;
      const second = sixteenths && step % 2;
      const v = (step === 0 ? 0.75 : 0.5) * (second ? 0.7 : 1) + 0.06 * r();
      // Ara onaltılık bir oktav üstte köpük gibi; piyano kayıtları C6'da (84) biter.
      const note = second && w[i] + 12 <= 84 ? w[i] + 12 : w[i];
      orc.play('piano', bus.piano.input, t, { midi: note, layer: 0, vel: v, dur: beat * 1.5, release: 0.7, pan: (i - 3.5) * 0.08, jitter: 0.012 });
    }

    // Bas: uzun kök; deniz savaşında kök-beşli sallanır (dörtlük).
    if (step === 0) orc.play('bass', this.bassIn, t, { midi: b.bass, vel: 0.7, dur: beat * (breath ? 2 : 4) - 0.05, release: 0.6 });
    if (L > 0.55 && step === 8 && !breath) orc.play('bass', this.bassIn, t, { midi: b.bass + 7 > 38 ? b.bass - 5 : b.bass + 7, vel: 0.6, dur: beat * 2 - 0.05, release: 0.4 });

    // Ezgi: geçişe göre kemanda / piyanoda (bir oktav aşağı) / ikisinde.
    for (const [bb, at, len, m] of SONG) {
      if (bb !== loopBar || Math.round(at * 4) !== step) continue;
      const dur = Math.min(len * beat, last && pass % 2 === 1 ? beat * 2 - 0.1 : Infinity) + 0.12;
      if (mode !== 1 && lv.vln > 0) orc.play('vln', bus.vln.input, t, { midi: m, layer: L > 0.45 ? 1 : 0, vel: L > 0.45 ? 0.75 : 1.9, dur, release: 0.6, jitter: 0.02 });
      if (mode !== 0) orc.play('piano', bus.piano.input, t, { midi: m - 12, layer: 1, vel: mode === 1 ? 0.85 : 0.55, dur, release: 0.6, pan: 0.15, jitter: 0.01 });
    }

    // Deniz savaşında keman tremolosu: ölçü boyu akorun beşlisi.
    if (lv.trem > 0 && step === 0 && !breath) {
      const fifth = b.tones[2] + 12 > 81 ? b.tones[2] : b.tones[2] + 12;
      orc.play('vlnTrem', bus.trem.input, t, { midi: fifth, vel: 0.8, dur: beat * 4 + 0.1, release: 0.5, pan: -0.15 });
    }

    if (lv.drums > 0) {
      // Dalga: tek ölçülerde timpani kabarıp söner.
      if (loopBar % 2 === 1 && !breath) {
        const v = 0.12 + 0.5 * Math.sin((Math.PI * step) / 16) * (0.5 + 0.5 * L);
        orc.play('timp', bus.drums.input, t, { midi: timpNote(b.root), vel: v, layer: v > 0.45 ? 1 : 0, jitter: 0.004 });
        orc.play('timp', bus.drums.input, t + dt / 2, { midi: timpNote(b.root), vel: v * 0.9, layer: 0, jitter: 0.004 });
      }
      // Kürek: ağır taiko, ölçüde iki (1 ve 3+).
      if ((step === 0 || step === 10) && !breath && L > 0.4) orc.play('taiko', bus.drums.input, t, { vel: step ? 0.6 : 0.85, layer: 1, pan: step ? 0.2 : -0.15 });
      // Top atışı: bas davul + taiko birlikte; geçişe göre farklı yerlerde.
      const salvo = pass % 2 ? [0, 6, 13] : [0, 9];
      if (L > 0.75 && salvo.includes(step) && !breath) {
        orc.play('bdrum', bus.drums.input, t, { vel: 0.8 + 0.2 * r(), layer: 1 });
        orc.play('taiko', bus.drums.input, t + 0.01, { vel: 0.8, layer: 1, pan: (r() - 0.5) * 0.6 });
      }
    }

    // Gitar duvarı: yarım ölçüde bir çınlayan power chord.
    if (lv.gtr > 0 && (step === 0 || step === 8) && !breath) {
      const pc = [b.root, b.root + 7, b.root + 12];
      for (const [side, lag] of [[this.gtrL, 0], [this.gtrR, 0.008 + 0.006 * r()]]) {
        pc.forEach((m, k) => orc.play('gtr', side, t + lag + k * 0.007, { midi: m, vel: 0.55, dur: beat * 1.9, release: 0.25, jitter: 0.002 }));
      }
    }
  }
}

/**
 * 50 saniyelik gösteri, iki geçiş: sakin denizden (0.1) deniz savaşına (0.95).
 * İkinci geçişte ezgi piyanoya geçer, toplar ve gitar duvarı girer.
 */
export const NAVAL_DEMO = {
  bars: 16,
  seconds: 50,
  level: (x) => Math.min(0.95, 0.1 + 0.06 * Math.floor(x)),
  micro: (x) => 0.2 + 0.4 * clamp01(x / 15),
};
