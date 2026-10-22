// Olay müzikleri: tek seferlik, 6-8 saniyelik vuruşlar (bkz. musicEngine.js CuePlayer).
//
//   savasIlani  timpani gürler → Mi power chord + piyano kıyamet oktavı → Fa'ya
//               (Frig ikinci derece: "yanlış" yarım ses yukarısı, uğursuz) → Mi'de çınlar
//   zafer       Si7 (gerilim) → Mi MAJÖR (Pikardi üçlüsü): mollde geçen bir oyunda
//               tek parlak an; temiz gitar yavaş tarama, keman üstte Sol# (majör üçlü)
//   yenilgi     piyano kıyamet oktavı, keman inen iç çekiş Mi-Do-Si, La minör → Mi
//               minör (plagal: "amin" kadansı, kabullenme), sonra sessizlik
//
// Hepsi Mi merkezli: savaş/barış/seferberlik döngülerinin üstüne vurduğunda tondan düşmez.

import { loadOrchestra } from './orchestra.js';
import { makeAmp, makeBassAmp, makeCleanAmp } from './guitar.js';
import { makeMixer } from './musicEngine.js';

// Bölük → [düzey, yankı payı]. Ölçümle dengelendi (render-music.mjs olay:<ad>).
const BUSES = {
  drums: [1.6, 0.35],
  gtr: [0.4, 0.15],
  clean: [0.8, 0.45],
  piano: [1.0, 0.4],
  vln: [1.2, 0.5],
  bass: [0.9, 0.05],
};

export class Cues {
  static CUES = { savasIlani: 6.5, zafer: 8, yenilgi: 8.5 };
  static INSTRUMENTS = ['timp', 'taiko', 'bdrum', 'snare', 'gtr', 'lead', 'pianoLow', 'piano', 'bass', 'vln', 'vlnTrem'];

  static async create(ctx, dest) {
    return new Cues(ctx, dest, await loadOrchestra(ctx, Cues.INSTRUMENTS));
  }

  constructor(ctx, dest, orchestra) {
    this.ctx = ctx;
    this.orc = orchestra;
    const { master, bus } = makeMixer(ctx, dest, BUSES);
    // Olaylarda fader yok: her bölük tam açık, denge trim'de.
    for (const b of Object.values(bus)) b.fader.gain.value = 1;
    const side = (pan) => {
      const amp = makeAmp(ctx);
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      amp.output.connect(p).connect(bus.gtr.input);
      return amp.input;
    };
    const clean = makeCleanAmp(ctx);
    clean.output.connect(bus.clean.input);
    const bassAmp = makeBassAmp(ctx);
    bassAmp.output.connect(bus.bass.input);
    Object.assign(this, { master, bus, gtrL: side(-0.8), gtrR: side(0.8), cleanIn: clean.input, bassIn: bassAmp.input });
  }

  cue(name, t) {
    this[name](t);
  }

  /** Bozulmuş gitar akoru, sol/sağ ayrı çalım (savaş parçasındaki duvar). */
  wall(t, midis, dur) {
    for (const [side, lag] of [[this.gtrL, 0], [this.gtrR, 0.009]]) {
      midis.forEach((m, k) => this.orc.play('gtr', side, t + lag + k * 0.007, { midi: m, vel: 0.6, dur, release: 0.8, jitter: 0.002 }));
    }
  }

  /** Timpani tremolosu (32'lik), hızı `from`dan `to`ya. */
  roll(t, midi, len, from, to) {
    const n = Math.round(len / 0.055);
    for (let i = 0; i < n; i++) {
      const v = from + (to - from) * (i / n);
      this.orc.play('timp', this.bus.drums.input, t + i * 0.055, { midi, vel: v, layer: v > 0.55 ? 1 : 0, jitter: 0.004 });
    }
  }

  savasIlani(t) {
    const { orc, bus } = this;
    this.roll(t, 52, 1.6, 0.15, 0.9);
    const hit = (at, root, dur) => {
      orc.play('taiko', bus.drums.input, at, { vel: 1, layer: 1 });
      orc.play('bdrum', bus.drums.input, at, { vel: 1, layer: 1 });
      orc.play('snare', bus.drums.input, at, { vel: 0.8, layer: 2 });
      this.wall(at, [root, root + 7, root + 12], dur);
      for (const m of [root - 12, root]) orc.play('pianoLow', bus.piano.input, at, { midi: m, layer: 1, vel: 1, dur, release: 1.5 });
      orc.play('bass', this.bassIn, at, { midi: root - 12, vel: 1, dur, release: 1 });
    };
    hit(t + 1.6, 40, 0.65);
    hit(t + 2.3, 41, 0.65);
    hit(t + 3.0, 40, 2.6);
    orc.play('vlnTrem', bus.vln.input, t + 3.0, { midi: 76, vel: 1, dur: 2.6, release: 0.8 });
    orc.play('vln', bus.vln.input, t + 3.0, { midi: 83, layer: 1, vel: 0.7, dur: 2.6, release: 0.8 });
  }

  zafer(t) {
    const { orc, bus } = this;
    // Si7: gerilim. Timpani Si üstünde kabarır, keman Fa# tutar.
    for (const [m, k] of [[47, 0], [51, 1], [54, 2], [57, 3]]) {
      orc.play(['pianoLow', 'piano'], bus.piano.input, t + k * 0.03, { midi: m, layer: 0, vel: 0.7, dur: 1.3, release: 0.4 });
    }
    orc.play('bass', this.bassIn, t, { midi: 35, vel: 0.8, dur: 1.3, release: 0.3 });
    orc.play('vln', bus.vln.input, t, { midi: 78, layer: 0, vel: 1.8, dur: 1.3, release: 0.3 });
    this.roll(t + 0.2, 47, 1.2, 0.15, 0.75);
    // Mi majör: her şey birden, temiz gitar aşağıdan yukarı yavaş tarar.
    const at = t + 1.45;
    orc.play('timp', bus.drums.input, at, { midi: 52, vel: 1, layer: 1 });
    orc.play('taiko', bus.drums.input, at, { vel: 0.9, layer: 1 });
    orc.play('bdrum', bus.drums.input, at, { vel: 0.8, layer: 1 });
    [40, 47, 52, 56, 59, 64].forEach((m, k) => orc.play(['gtr', 'lead'], this.cleanIn, at + k * 0.028, { midi: m, vel: 0.8, dur: 5.5, release: 1.5, pan: (k - 2.5) * 0.12 }));
    for (const [m, k] of [[52, 0], [56, 1], [59, 2], [64, 3]]) orc.play('piano', bus.piano.input, at + k * 0.02, { midi: m, layer: 1, vel: 0.75, dur: 5.5, release: 1.5 });
    for (const m of [28, 40]) orc.play('pianoLow', bus.piano.input, at, { midi: m, layer: 1, vel: 0.8, dur: 5.5, release: 1.5 });
    orc.play('bass', this.bassIn, at, { midi: 28, vel: 0.9, dur: 5.5, release: 1.2 });
    orc.play('vln', bus.vln.input, at, { midi: 80, layer: 1, vel: 0.8, dur: 5.5, release: 1.5 });
  }

  yenilgi(t) {
    const { orc, bus } = this;
    for (const m of [28, 40]) orc.play('pianoLow', bus.piano.input, t, { midi: m, layer: 1, vel: 0.9, dur: 3, release: 2 });
    orc.play('taiko', bus.drums.input, t, { vel: 0.5, layer: 0 });
    orc.play('bass', this.bassIn, t, { midi: 28, vel: 0.7, dur: 2.2, release: 1 });
    // Keman iç çekişi: Mi → Do → Si, hafif kayıt.
    for (const [m, at, len] of [[76, 0.3, 1.3], [72, 1.6, 1.3], [71, 2.9, 3.6]]) {
      orc.play('vln', bus.vln.input, t + at, { midi: m, layer: 0, vel: 1.9, dur: len, release: 1, jitter: 0.02 });
    }
    // La minör → Mi minör (plagal), yavaş ve hafif.
    const chord = (at, notes, bass) => {
      notes.forEach((m, k) => orc.play('piano', bus.piano.input, t + at + k * 0.03, { midi: m, layer: 0, vel: 0.6, dur: 2.6, release: 1.8 }));
      orc.play('bass', this.bassIn, t + at, { midi: bass, vel: 0.6, dur: 2.6, release: 1.5 });
    };
    chord(1.6, [57, 60, 64], 33);
    chord(2.9, [52, 55, 59], 28);
  }
}
