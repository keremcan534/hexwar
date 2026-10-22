// Seferberlik müziği: barıştan savaşa köprü.
//
// Tek girdi `level` = SEFERBERLİK (0..1):
//   0     taiko "çizme" adımları (dörtlük), piyanonun alçak oktav adımları, uzun bas
//   →0.5  bas ve kısık gitar Mi pedalında sekizlik yürür; keman marş temasını çalar
//   →0.8  bozulmuş gitar duvarı yarım ölçüde bir power chord vurur (savaşın habercisi)
// El hızı: tempo 96→108, yürüyüşe onaltılık süs (taiko çırpması, bas dörtnalı).
//
// Mi minör, savaş ve barış parçalarıyla aynı ton: üçü birbirine dikişsiz geçer.
// Sahra trampeti YOK (Kerem: askerî süs vuruşları "Müttefik" hissi veriyordu);
// yürüyüşü davul değil taiko + piyano adımları taşır.
//
// Döngü (8 ölçü): Em | C | D | Em | Am | C | B7 | Em. Geçişler farklı çalar:
// tema kemanda / piyanoda (keman susar, davul yarım zaman) / ikisi oktav unison.

import { loadOrchestra } from './orchestra.js';
import { makeAmp, makeBassAmp } from './guitar.js';
import { clamp01, makeMixer, ramp, rng, setFaders } from './musicEngine.js';

// Ölçü başına: bas kökü (bas gitar), akor kökü (power chord için).
const BARS = [
  { bass: 28, root: 40 }, // Em
  { bass: 36, root: 48 }, // C
  { bass: 38, root: 50 }, // D
  { bass: 28, root: 40 }, // Em
  { bass: 33, root: 45 }, // Am
  { bass: 36, root: 48 }, // C
  { bass: 35, root: 47 }, // B7
  { bass: 28, root: 40 }, // Em
];

// Marş teması (armonik minör, Re#): [ölçü, vuruş, süre(vuruş), MIDI]. Uzun,
// dik notalar: yürüyen bir ordu, koşan değil.
const THEME = [
  [0, 0, 3, 71], [0, 3, 1, 76],
  [1, 0, 2, 79], [1, 2, 1, 78], [1, 3, 1, 76],
  [2, 0, 3, 78], [2, 3, 1, 81],
  [3, 0, 2, 79], [3, 2, 2, 76],
  [4, 0, 1, 81], [4, 1, 1, 79], [4, 2, 1, 78], [4, 3, 1, 76],
  [5, 0, 2, 76], [5, 2, 2, 79],
  [6, 0, 1, 78], [6, 1, 1, 75], [6, 2, 1, 78], [6, 3, 1, 81],
  [7, 0, 4, 76],
];

// Mi pedalı (kısık gitar) ve taiko adım hızları (dörtlük: güçlü-zayıf-orta-zayıf).
const PEDAL = [40, 47];
const STEP_VEL = { 0: 1, 4: 0.55, 8: 0.8, 12: 0.55 };

const power = (root) => [root, root + 7, root + 12];

// Döngüdeki enerji yayı (yürüyüş, bas, gitar duvarı ve kısmen davula çarpan).
// İlk sürümde yüksek seferberlikte ses hiç inip çıkmıyordu (form-probe dinamik
// 2.5 dB; savaşta aynı kusur 1.3 dB'ydi ve mobil oyun hissinin parçasıydı).
const ENERGY = [0.4, 0.55, 0.85, 0.95, 1, 1, 0.75, 0.9];
/** Timpani akorun kökünü 41-55 aralığında çalar; kayıtlar orada. */
const timpNote = (m) => (m < 41 ? m + 12 : m > 55 ? m - 12 : m);

export function layerLevels(L) {
  return {
    drums: 0.5 + 0.5 * ramp(L, 0, 0.6),
    piano: 0.85,
    bass: ramp(L, 0.1, 0.35),
    mute: ramp(L, 0.3, 0.55),
    vln: ramp(L, 0.15, 0.35),
    gtr: ramp(L, 0.7, 0.9),
  };
}

export const tempoFor = (micro) => 96 + 12 * micro;

// Bölük → [düzey, yankı payı]. Ölçümle dengelendi (render-music.mjs sefer --stems):
// ilk dengede tema kemanı piyano adımlarının ve yürüyüşün 10 dB altındaydı.
const BUSES = {
  drums: [1.8, 0.3],
  piano: [1.0, 0.3],
  bass: [0.9, 0.05],
  mute: [0.5, 0.1],
  vln: [2.6, 0.45],
  gtr: [0.35, 0.1],
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
  const muteAmp = makeAmp(ctx);
  muteAmp.output.connect(bus.mute.input);
  const bassAmp = makeBassAmp(ctx);
  bassAmp.output.connect(bus.bass.input);
  // Yürüyüş gitarı palm mute yolundan (bkz. guitar.js makeAmp).
  return { master, bus, gtrL: side(-0.8), gtrR: side(0.8), muteIn: muteAmp.muteInput, bassIn: bassAmp.input };
}

export class MarchScore {
  /** Çözülecek enstrümanlar (bkz. orchestra.js: tembel çözme, bellek). */
  static INSTRUMENTS = ['taiko', 'taikoHi', 'bdrum', 'timp', 'piano', 'pianoLow', 'bass', 'bassMute', 'gtrMute', 'gtr', 'vln'];
  static BARS = BARS.length;
  static tempoFor = tempoFor;
  static layerLevels = layerLevels;

  static async create(ctx, dest, opts) {
    return new MarchScore(ctx, dest, await loadOrchestra(ctx, MarchScore.INSTRUMENTS), opts);
  }

  constructor(ctx, dest, orchestra, { seed = 1914 } = {}) {
    this.ctx = ctx;
    this.orc = orchestra;
    Object.assign(this, buildMixer(ctx, dest));
    this.rand = rng(seed);
  }

  /** @param L seferberlik 0..1; `bar` mutlak sayaç — diğerleri BattleScore.scheduleStep gibi. */
  scheduleStep(t, dt, bar, step, L, micro) {
    const { orc, bus } = this;
    const loopBar = bar % BARS.length;
    const pass = Math.floor(bar / BARS.length);
    const mode = pass % 3;
    const b = BARS[loopBar];
    const beat = dt * 4;
    const r = this.rand;
    const last = loopBar === BARS.length - 1;
    const base = layerLevels(L);
    const e = ENERGY[loopBar];
    const lv = { ...base, mute: base.mute * e, bass: base.bass * e, gtr: base.gtr * e, drums: base.drums * (0.7 + 0.3 * e) };
    setFaders(bus, lv, t);
    // Kırılma: tek geçişlerin son yarım ölçüsünde her şey susar; yalnız
    // sonundaki taiko çırpması döngü başına taşır.
    const breakHalf = last && pass % 2 === 1 && step >= 8;
    // Yalın giriş: ilk geçişten sonra döngü başı yürüyüşsüz ve duvarsız.
    const lean = pass > 0 && loopBar < 2;
    // Temanın piyanoda olduğu geçişte davul ilk dört ölçüde yarım zaman.
    const halfTime = mode === 1 && loopBar < 4;

    // Taiko adımları; el hızı yüksekse ölçü sonunda çırpma (onaltılık süs).
    if (step in STEP_VEL && !(halfTime && step % 8) && !breakHalf) {
      const v = STEP_VEL[step] * (0.9 + 0.1 * r());
      orc.play('taiko', bus.drums.input, t, { vel: v, layer: v > 0.7 ? 1 : 0, pan: step % 8 ? 0.2 : -0.15, jitter: 0.006 });
    }
    if ((breakHalf || micro > 0.5) && (step === 14 || step === 15)) orc.play('taikoHi', bus.drums.input, t, { vel: (breakHalf ? 0.5 : 0.3) + 0.15 * (step - 14), layer: breakHalf ? 1 : 0, pan: 0.3 });
    if (step === 0 && L > 0.4) orc.play('bdrum', bus.drums.input, t, { vel: 0.4 + 0.4 * L, layer: L > 0.75 ? 1 : 0 });
    if (step === 0 && L > 0.5) orc.play('timp', bus.drums.input, t, { midi: timpNote(b.root), vel: 0.6, layer: 1 });
    // Çift geçişlerin son ölçüsünde timpani tremolosu döngü başına çeker.
    if (last && pass % 2 === 0 && L > 0.5 && step >= 8) {
      for (let k = 0; k < 2; k++) {
        const v = 0.2 + 0.5 * ((step - 8 + k / 2) / 8);
        orc.play('timp', bus.drums.input, t + (k * dt) / 2, { midi: 47, vel: v, layer: v > 0.5 ? 1 : 0 });
      }
    }

    // Piyano adımları: yarım notalık alçak oktav (sol el), kırılmada susar.
    if ((step === 0 || step === 8) && !breakHalf) {
      const v = step ? 0.6 : 0.8;
      for (const m of [b.root, b.root + 12]) orc.play(['pianoLow', 'piano'], bus.piano.input, t, { midi: m, layer: 1, vel: v, dur: beat * 2 - 0.05, release: 0.6, jitter: 0.006 });
    }

    // Bas: ölçü boyu kök; seferberlik artınca kısık gitarla Mi pedalında sekizlik.
    if (step === 0) orc.play('bass', this.bassIn, t, { midi: b.bass, vel: 0.6, dur: beat * (breakHalf ? 2 : 4) - 0.05, release: 0.5 });
    const gallop = mode === 2 && loopBar >= 4 && micro > 0.6;
    if (lv.mute > 0 && !breakHalf && !lean && (step % 2 === 0 || (gallop && step % 4 === 3))) {
      const accent = step === 0 || step === 6 || step === 12;
      const v = (accent ? 0.9 : 0.6) * (0.92 + 0.08 * r());
      PEDAL.forEach((m, k) => orc.play('gtrMute', this.muteIn, t + k * 0.002, { midi: m, vel: v, dur: dt * 1.5, release: 0.04, jitter: 0.003 }));
      orc.play('bassMute', this.bassIn, t, { midi: 28, vel: v * 0.7, dur: dt * 1.5, release: 0.04, jitter: 0.003 });
    }

    // Tema: geçişe göre kemanda / piyanoda (bir oktav aşağıda) / ikisinde birden.
    for (const [bb, at, len, m] of THEME) {
      if (bb !== loopBar || Math.round(at * 4) !== step) continue;
      // Kırılma ölçüsünde temanın son notası yarım ölçüde biter; yoksa kemanın
      // tam notası sessizliğin içinden çınlıyordu (susma %0 ölçüldü).
      const breakBar = last && pass % 2 === 1;
      const dur = Math.min(len * beat, breakBar ? beat * 2 - 0.1 : Infinity) + 0.08;
      // Marş teması güçlü (f) kayıtla; hafif kayıt yalnız seferberliğin başında.
      if (mode !== 1 && lv.vln > 0) {
        orc.play('vln', bus.vln.input, t, { midi: m, layer: L > 0.35 ? 1 : 0, vel: L > 0.35 ? 0.8 : 1.9, dur, release: 0.5, jitter: 0.015 });
      }
      if (mode !== 0) orc.play('piano', bus.piano.input, t, { midi: m - 12, layer: 1, vel: mode === 1 ? 0.9 : 0.6, dur, release: 0.5, pan: 0.15, jitter: 0.01 });
    }

    // Bozulmuş gitar duvarı: yarım ölçüde bir çınlayan power chord (savaşın habercisi).
    if (lv.gtr > 0 && (step === 0 || step === 8) && !breakHalf && !lean) {
      const pc = power(b.root);
      for (const [side, lag] of [[this.gtrL, 0], [this.gtrR, 0.008 + 0.006 * r()]]) {
        pc.forEach((m, k) => orc.play('gtr', side, t + lag + k * 0.007, { midi: m, vel: 0.55, dur: beat * 1.9, release: 0.2, jitter: 0.002 }));
      }
    }
  }
}

/**
 * 40 saniyelik gösteri, iki geçiş: seferberlik 0.2'den 0.95'e tırmanır (taiko
 * adımları → yürüyen bas ve gitar → keman teması → gitar duvarı); ikinci geçiş
 * temayı piyanoya verir. El hızı 0.2 → 0.7.
 */
export const MARCH_DEMO = {
  bars: 16,
  seconds: 40,
  level: (x) => Math.min(0.95, 0.2 + 0.05 * Math.floor(x)),
  micro: (x) => 0.2 + 0.5 * clamp01(x / 15),
};
