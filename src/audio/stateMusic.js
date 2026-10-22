// Devlet müziği: diplomasi ve ekonomi ekranları için sakin, piyano öncülüğünde.
//
// Tek girdi `level` = SICAKLIK (0..1): devletin hâli iyiyken oda dolar.
//   0     piyano tek başına (sol el bas, sağ el kırık akor ya da ezgi)
//   →0.5  bas gitar uzun kökler; keman ezgiyi devralır
//   →0.7  temiz gitar sekizlik arpejle eşlik eder
// El hızı hafif: tempo 62→70. Rubato güçlü (cümle sonunda %15 yavaşlama):
// bu ekranlarda oyuncu okur, müzik metronom gibi itmemeli.
//
// Sol majör / Mi minör (diğer parçaların göreli majörü): her şey minör
// olmasın, ama parlak ve sevimli de olmasın — tiz çalgı ve tıngırtı yok,
// orta register, yavaş. Döngü (8 ölçü): G | D/F# | Em | C | G | Am | D | G.
// Geçişler: ezgi piyanoda / kemanda (piyano kırık akor) / ikisi oktav unison.

import { loadOrchestra } from './orchestra.js';
import { makeBassAmp, makeCleanAmp } from './guitar.js';
import { clamp01, makeMixer, phraseRubato, ramp, rng, setFaders } from './musicEngine.js';

// Ölçü başına: bas gitar kökü, piyano sol el (alçak), sağ el akor sesleri, gitar arpeji.
const BARS = [
  { bass: 31, left: 43, chord: [59, 62, 67], arp: [43, 50, 55, 59, 62, 59, 55, 50] }, // G
  { bass: 30, left: 42, chord: [57, 62, 66], arp: [42, 50, 54, 57, 62, 57, 54, 50] }, // D/F#
  { bass: 28, left: 40, chord: [59, 64, 67], arp: [40, 47, 52, 55, 59, 55, 52, 47] }, // Em
  { bass: 36, left: 36, chord: [60, 64, 67], arp: [48, 55, 60, 64, 67, 64, 60, 55] }, // C
  { bass: 31, left: 43, chord: [59, 62, 67], arp: [43, 50, 55, 59, 62, 59, 55, 50] }, // G
  { bass: 33, left: 45, chord: [60, 64, 69], arp: [45, 52, 57, 60, 64, 60, 57, 52] }, // Am
  { bass: 38, left: 38, chord: [57, 62, 66], arp: [50, 57, 62, 66, 69, 66, 62, 57] }, // D
  { bass: 31, left: 43, chord: [59, 62, 67], arp: [43, 50, 55, 59, 62, 59, 55, 50] }, // G
];

// Ezgi: [ölçü, vuruş, süre(vuruş), MIDI]. Sakin, adım adım; son ölçü tek uzun nota.
const MELODY = [
  [0, 0, 2, 74], [0, 2, 1, 71], [0, 3, 1, 67],
  [1, 0, 3, 69], [1, 3, 1, 74],
  [2, 0, 2, 79], [2, 2, 1, 78], [2, 3, 1, 76],
  [3, 0, 3, 76], [3, 3, 1, 74],
  [4, 0, 1.5, 71], [4, 1.5, 0.5, 72], [4, 2, 2, 74],
  [5, 0, 1, 76], [5, 1, 1, 72], [5, 2, 2, 69],
  [6, 0, 2, 66], [6, 2, 1, 69], [6, 3, 1, 72],
  [7, 0, 4, 71],
];
// Kırık akor sırası (dörtlük): alt-orta-üst-orta.
const BROKEN = [0, 1, 2, 1];

export function layerLevels(L) {
  return {
    piano: 1,
    bass: ramp(L, 0.25, 0.5),
    vln: ramp(L, 0.3, 0.55),
    gtr: ramp(L, 0.45, 0.7),
  };
}

export const tempoFor = (micro) => 62 + 8 * micro;
/** Barıştan daha geniş rubato: cümle sonunda %15, döngü sonunda ayrıca %15. */
export const tempoAt = (micro, bar, step) => phraseRubato(tempoFor(micro), bar, step, BARS.length, { push: 0.04, rit: 0.15, endRit: 0.15 });

// Bölük → [düzey, yankı payı]. Ölçümle dengelendi (render-music.mjs devlet --stems):
// ilk dengede keman ezgisi piyano eşliğiyle eşit, gitar duyulmaz (−34 dB) idi.
const BUSES = {
  piano: [1.0, 0.4],
  bass: [0.7, 0.1],
  vln: [1.7, 0.5],
  gtr: [1.2, 0.4],
};

function buildMixer(ctx, dest) {
  const { master, bus } = makeMixer(ctx, dest, BUSES);
  const gtrAmp = makeCleanAmp(ctx);
  gtrAmp.output.connect(bus.gtr.input);
  const bassAmp = makeBassAmp(ctx);
  bassAmp.output.connect(bus.bass.input);
  return { master, bus, gtrIn: gtrAmp.input, bassIn: bassAmp.input };
}

export class StateScore {
  /** Çözülecek enstrümanlar (bkz. orchestra.js: tembel çözme, bellek). */
  static INSTRUMENTS = ['piano', 'pianoLow', 'vln', 'gtr', 'lead', 'bass'];
  static BARS = BARS.length;
  static tempoFor = tempoFor;
  static tempoAt = tempoAt;
  static layerLevels = layerLevels;

  static async create(ctx, dest, opts) {
    return new StateScore(ctx, dest, await loadOrchestra(ctx, StateScore.INSTRUMENTS), opts);
  }

  constructor(ctx, dest, orchestra, { seed = 1856 } = {}) {
    this.ctx = ctx;
    this.orc = orchestra;
    Object.assign(this, buildMixer(ctx, dest));
    this.rand = rng(seed);
  }

  /** @param L sıcaklık 0..1; `bar` mutlak sayaç — diğerleri BattleScore.scheduleStep gibi. */
  scheduleStep(t, dt, bar, step, L, micro) {
    const { orc, bus } = this;
    const lv = layerLevels(L);
    setFaders(bus, lv, t, 0.8);
    const loopBar = bar % BARS.length;
    const pass = Math.floor(bar / BARS.length);
    // Keman yoksa (soğukken) ezgi her geçişte piyanoda kalır.
    const mode = lv.vln > 0 ? pass % 3 : 0;
    const b = BARS[loopBar];
    const beat = dt * 4;
    const r = this.rand;
    const last = loopBar === BARS.length - 1;
    // Nefes: son ölçünün ikinci yarısında yeni nota yok; tek geçişlerde son ölçü bütünüyle çınlar.
    const breath = last && step >= (pass % 2 ? 4 : 8);
    const piano = (midi, o) => orc.play(['pianoLow', 'piano'], bus.piano.input, t, { midi, layer: 0, release: 0.9, jitter: 0.012, ...o });

    // Sol el: ölçü başında alçak kök, son ölçüde bütün ölçü çınlar.
    if (step === 0) piano(b.left, { vel: 0.75, dur: beat * (last ? 4 : 3.5) });

    // Sağ el: ezgi piyanodaysa ölçü başında tek bir iç akor sesi; değilse
    // dörtlük kırık akor (piyanist eşliği).
    if (!breath && step % 4 === 0) {
      if (mode === 1) piano(b.chord[BROKEN[step / 4]], { vel: step ? 0.5 : 0.62, dur: beat * 1.6, pan: 0.1 });
      else if (step === 0) piano(b.chord[1], { vel: 0.45, dur: beat * 3, pan: 0.1 });
    }

    // Ezgi: geçişe göre piyanoda / kemanda / ikisinde birden (piyano bir oktav aşağı).
    for (const [bb, at, len, m] of MELODY) {
      if (bb !== loopBar || Math.round(at * 4) !== step) continue;
      const dur = len * beat + 0.15;
      if (mode === 0) piano(m, { vel: 0.8, dur, pan: -0.05 });
      if (mode >= 1) orc.play('vln', bus.vln.input, t, { midi: m, layer: 0, vel: 1.8, dur, release: 0.7, jitter: 0.02 });
      if (mode === 2) piano(m - 12, { vel: 0.55, dur, pan: 0.15 });
    }

    // Bas gitar: ölçü boyu kök, yumuşak.
    if (lv.bass > 0 && step === 0) orc.play('bass', this.bassIn, t, { midi: b.bass, vel: 0.55, dur: beat * 4 - 0.05, release: 0.8 });

    // Temiz gitar: sıcaklık yüksekken sekizlik arpej; ikinci geçişte yarısı (dörtlük).
    if (lv.gtr > 0 && !breath && step % 2 === 0 && !(mode === 1 && step % 4)) {
      const i = step / 2;
      orc.play(['gtr', 'lead'], this.gtrIn, t, { midi: b.arp[i], vel: (i ? 0.5 : 0.65) + 0.06 * r(), dur: beat * 1.5, release: 0.5, pan: i % 2 ? 0.35 : -0.35, jitter: 0.014 });
    }
  }
}

/**
 * 64 saniyelik gösteri, iki geçiş: ilk geçiş piyano tek başına başlar, sıcaklık
 * 0.1'den 0.8'e çıkar (bas, keman, gitar); ikinci geçişte ezgi kemanda, piyano
 * kırık akorla eşlik eder. El hızı 0.1 → 0.4.
 */
export const STATE_DEMO = {
  bars: 16,
  seconds: 66,
  level: (x) => Math.min(0.8, 0.1 + 0.07 * Math.floor(x)),
  micro: (x) => 0.1 + 0.3 * clamp01(x / 15),
};
