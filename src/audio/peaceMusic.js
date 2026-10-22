// Barış / gerilim müziği: solo keman ağıdı + temiz gitar arpeji + piyano.
//
// Tek girdi `level` = GERİLİM (0..1):
//   0     barış — solo keman (gerçek kayıt, vibratolu) yavaş bir ağıt çalar,
//         altında temiz gitar arpeji ve uzun bas notaları
//   →0.5  kalp atışı (yumuşak taiko), timpani; gitar geri çekilir
//   →1    keman ağıttan tremoloya geçer, bas ve kısık gitar sekizlik nabız atar,
//         piyano alçak oktavla "kıyamet" notası vurur
// Piyano (gerçek Steinway B): ikinci geçişin boş yarısında yumuşak bir motif,
// cümlenin ikinci yarısında kemanın altında hafif akorlar.
// El hızı (mikro) burada hafiftir: tempo 70→80, arpej sekizlikten onaltılığa.
//
// Mi minör, savaş parçasıyla aynı ton: gerilim savaşa döndüğünde geçiş dikişsiz.
// Bölük yaylı/pirinç YOK: Kerem savaş parçasında uzun yaylıları ve pirinci
// "mobil oyun" buldu; keman burada tek başına, insan sesi gibi çalar.
//
// Form (mobil oyun hissine karşı; ilk sürümde iki geçiş arası fark 0.8 dB,
// tempo sabit 73, hiç susma yoktu):
//   rubato   — tempo cümle içinde nefes alır, cümle sonunda ve döngü sonunda yavaşlar
//   nefes    — döngünün son yarım ölçüsünde arpej susar; tek geçişlerde keman
//              ve bas da susar (gerilimde yalnız kalp atışı kalır)
//   geçişler — ağıt / önce boşluk sonra karşı ezgi / ağıt + başka son;
//              arpej düzeni ve tremolo da geçişe göre değişir
//
// Döngü (8 ölçü, inen bas): Em | Am | D | G/B | C | Am | B7 | Em.
// Armonik minör (Re#) ve inen bas, Rus romansı rengidir.

import { loadOrchestra } from './orchestra.js';
import { makeBassAmp, makeCleanAmp } from './guitar.js';
import { clamp01, makeMixer, phraseRubato, ramp, rng, setFaders } from './musicEngine.js';

// Ölçü başına: bas kökü, arpej (8 sekizlik), tremolo notası (gerilimde keman).
const BARS = [
  { bass: 28, arp: [40, 47, 52, 55, 59, 55, 52, 47], trem: 71 }, // Em
  { bass: 33, arp: [45, 52, 57, 60, 64, 60, 57, 52], trem: 72 }, // Am
  { bass: 38, arp: [50, 57, 62, 66, 69, 66, 62, 57], trem: 74 }, // D
  { bass: 35, arp: [47, 50, 55, 59, 62, 59, 55, 50], trem: 74 }, // G/B
  { bass: 36, arp: [48, 55, 60, 64, 67, 64, 60, 55], trem: 76 }, // C
  { bass: 33, arp: [45, 52, 57, 60, 64, 60, 57, 52], trem: 76 }, // Am
  { bass: 35, arp: [47, 54, 59, 63, 66, 63, 59, 54], trem: 75 }, // B7
  { bass: 28, arp: [40, 47, 52, 55, 59, 55, 52, 47], trem: 71 }, // Em
];

// Ağıt: [ölçü, vuruş, süre(vuruş), MIDI]. 4.-5. ölçü cümlenin doruğu (f).
const LAMENT = [
  [0, 1, 1, 71], [0, 2, 1.5, 76], [0, 3.5, 0.5, 78],
  [1, 0, 2, 79], [1, 2, 1, 78], [1, 3, 1, 76],
  [2, 0, 3, 78], [2, 3, 1, 74],
  [3, 0, 2, 74], [3, 2, 2, 71],
  [4, 0, 1.5, 72], [4, 1.5, 0.5, 76], [4, 2, 2, 79],
  [5, 0, 2, 81], [5, 2, 1, 79], [5, 3, 1, 76],
  [6, 0, 2, 75], [6, 2, 1, 78], [6, 3, 1, 81],
  [7, 0, 1, 78], [7, 1, 3, 76],
];
// İkinci geçiş: ilk dört ölçü boş (arpej ve bas tek başına), sonra uzun
// notalı karşı ezgi; son nota yarım ölçüde biter (nefes).
const COUNTER = [
  [4, 0, 4, 76],
  [5, 0, 2, 76], [5, 2, 2, 79],
  [6, 0, 2, 75], [6, 2, 2, 78],
  [7, 0, 1.25, 76],
];
// Üçüncü geçiş: ağıt, ama doruğa tırmanan başka bir son.
const LAMENT_ALT = [
  ...LAMENT.filter(([b]) => b < 6),
  [6, 0, 1, 75], [6, 1, 1, 78], [6, 2, 2, 83],
  [7, 0, 1, 81], [7, 1, 1, 79], [7, 2, 2, 76],
];
const LINES = [LAMENT, COUNTER, LAMENT_ALT];
const CLIMAX = new Set([4, 5]);

// Piyano motifi: ikinci geçişin boş ilk dört ölçüsünü doldurur (keman orada
// susuyordu; boşluk kalsın ama sessizlik değil, tek bir el). Akor sesleriyle iner.
const PIANO_MOTIF = [
  [0, 0, 2, 76], [0, 2, 1, 71], [0, 3, 1, 67],
  [1, 0, 2, 72], [1, 2, 2, 69],
  [2, 0, 1.5, 78], [2, 1.5, 0.5, 74], [2, 2, 2, 69],
  [3, 0, 1, 67], [3, 1, 1, 71], [3, 2, 2, 74],
];
// Cümlenin ikinci yarısında ölçü başı akor (orta register, kemanın altında).
const PIANO_CHORDS = { 4: [55, 60, 64], 5: [57, 60, 64], 6: [54, 57, 63], 7: [52, 55, 59] };

// Arpej sırası (8 sekizlik): yukarı-aşağı; üçüncü geçişte üst nota pedalı.
const ARP_ORDER = [[0, 1, 2, 3, 4, 5, 6, 7], [0, 1, 2, 3, 4, 5, 6, 7], [0, 4, 3, 4, 2, 4, 1, 4]];

// Çug teli (savaş parçasıyla aynı Mi pedalı, burada temiz ve kısık).
const PEDAL = [40, 47];

/** Bölüklerin gerilime göre düzeyi. */
export function layerLevels(T) {
  return {
    arp: 1 - 0.55 * ramp(T, 0.4, 0.9),
    bass: 0.85,
    vln: 1 - ramp(T, 0.45, 0.7),
    trem: ramp(T, 0.45, 0.7),
    drums: ramp(T, 0.25, 0.6),
    pulse: ramp(T, 0.55, 0.85),
    piano: 1 - 0.35 * ramp(T, 0.5, 0.9),
  };
}

export const tempoFor = (micro) => 70 + 10 * micro;

/** Rubato (bkz. musicEngine.js phraseRubato): cümle içinde nefes, sonda yavaşlama. */
export const tempoAt = (micro, bar, step) => phraseRubato(tempoFor(micro), bar, step, BARS.length);

// Bölük → [düzey, yankı payı]. Ölçümle dengelendi (render-music.mjs baris
// --stems, bölük başına barış ve gerilim yarısı ayrı): keman arpejin ~4 dB
// üstünde (ilk dengede eşitti, ağıt gömülüyordu).
const BUSES = {
  arp: [0.76, 0.4],
  bass: [0.8, 0.1],
  vln: [1.27, 0.45],
  trem: [1.07, 0.45],
  drums: [2.05, 0.3],
  pulse: [1.58, 0.15],
  piano: [1.0, 0.35],
};

function buildMixer(ctx, dest) {
  const { master, bus } = makeMixer(ctx, dest, BUSES);
  const arpAmp = makeCleanAmp(ctx);
  arpAmp.output.connect(bus.arp.input);
  const pulseAmp = makeCleanAmp(ctx);
  pulseAmp.output.connect(bus.pulse.input);
  const bassAmp = makeBassAmp(ctx);
  bassAmp.output.connect(bus.bass.input);
  return { master, bus, arpIn: arpAmp.input, pulseIn: pulseAmp.input, bassIn: bassAmp.input };
}

export class PeaceScore {
  /** Çözülecek enstrümanlar (bkz. orchestra.js: tembel çözme, bellek). */
  static INSTRUMENTS = ['gtr', 'lead', 'gtrMute', 'bass', 'bassMute', 'vln', 'vlnTrem', 'taiko', 'timp', 'bdrum', 'piano', 'pianoLow'];
  static BARS = BARS.length;
  static tempoFor = tempoFor;
  static tempoAt = tempoAt;
  static layerLevels = layerLevels;

  static async create(ctx, dest, opts) {
    return new PeaceScore(ctx, dest, await loadOrchestra(ctx, PeaceScore.INSTRUMENTS), opts);
  }

  constructor(ctx, dest, orchestra, { seed = 1878 } = {}) {
    this.ctx = ctx;
    this.orc = orchestra;
    Object.assign(this, buildMixer(ctx, dest));
    this.rand = rng(seed);
  }

  /** @param T gerilim 0..1; `bar` mutlak sayaç — diğerleri BattleScore.scheduleStep gibi. */
  scheduleStep(t, dt, bar, step, T, micro) {
    const { orc, bus } = this;
    const lv = layerLevels(T);
    setFaders(bus, lv, t, 0.6);
    const loopBar = bar % BARS.length;
    const pass = Math.floor(bar / BARS.length);
    const mode = pass % 3;
    const b = BARS[loopBar];
    const beat = dt * 4;
    const r = this.rand;
    const last = loopBar === BARS.length - 1;
    // Nefes: döngü sonunda arpej susar; tek geçişlerde son ölçünün yarısından
    // fazlası boş kalır (kalp hariç), ritardando onu ~2.5 sn'ye uzatır.
    const breath = last && step >= (pass % 2 ? 6 : 12);
    const deepBreath = last && pass % 2 === 1;
    // Gitar notası en az kaydıracak kayıttan: alt teller Hofner, üstü Gretsch.
    const gtr = ['gtr', 'lead'];

    // Temiz arpej: sekizlikler; ikinci geçişin boş yarısında dörtlükler,
    // el hızı artınca aradaki onaltılıklar dolar.
    const sparse = mode === 1 && loopBar < 4;
    if (!breath && step % 2 === 0 && !(sparse && step % 4)) {
      const i = ARP_ORDER[mode][step / 2];
      const vel = (step === 0 ? 0.9 : 0.62) + 0.08 * r();
      orc.play(gtr, this.arpIn, t, { midi: b.arp[i], vel, dur: beat * (sparse ? 3 : 2), release: 0.5, pan: i % 2 ? 0.3 : -0.3, jitter: 0.012 });
    } else if (!breath && !sparse && step % 2 && micro > 0.55) {
      const i = (step - 1) / 2;
      orc.play(gtr, this.arpIn, t, { midi: b.arp[(i + 2) % 8], vel: 0.38, dur: beat, release: 0.4, pan: 0.1, jitter: 0.012 });
    }

    // Bas: ölçü boyu uzun kök (derin nefeste yarım ölçü); nabızda Mi pedalı.
    if (step === 0) this.orc.play('bass', this.bassIn, t, { midi: b.bass, vel: 0.8, dur: beat * (deepBreath ? 1.5 : 4) - 0.05, release: deepBreath ? 0.3 : 0.6 });
    // Nabız: çift geçişlerde sekizlik, tek geçişlerde ağır dörtlük.
    const pulseEvery = pass % 2 ? 4 : 2;
    if (lv.pulse > 0 && step % pulseEvery === 0 && !(deepBreath && step >= 6) && !(pass % 2 && loopBar === 3)) {
      const v = (step % 8 === 0 ? 0.7 : 0.5) * (0.92 + 0.08 * r());
      this.orc.play('bassMute', this.bassIn, t, { midi: 28, vel: v * 0.8, dur: dt * 1.6, release: 0.05, jitter: 0.003 });
      PEDAL.forEach((m, k) => orc.play('gtrMute', this.pulseIn, t + k * 0.002, { midi: m, vel: v, dur: dt * 1.6, release: 0.05, jitter: 0.003 }));
    }

    // Keman (barış): geçişe göre ağıt / karşı ezgi / başka sonlu ağıt. Doruk
    // ölçülerinde güçlü (f) kayıt, gerisi hafif (p); hafif kayıt ~12 dB kısık
    // kaydedildiği için hızı yüksek tutulur.
    if (lv.vln > 0) {
      for (const [bb, at, len, m] of LINES[mode]) {
        if (bb !== loopBar || Math.round(at * 4) !== step) continue;
        const loud = CLIMAX.has(bb);
        orc.play('vln', bus.vln.input, t, { midi: m, layer: loud ? 1 : 0, vel: loud ? 0.75 : 2.0, dur: len * beat + 0.12, release: 0.6, jitter: 0.02 });
      }
    }

    // Piyano. Motif: ikinci geçişin boş yarısında, hafif katman; her ölçünün
    // ilk notasına bir oktav aşağıdan sol el eşlik eder.
    if (mode === 1 && loopBar < 4) {
      for (const [bb, at, len, m] of PIANO_MOTIF) {
        if (bb !== loopBar || Math.round(at * 4) !== step) continue;
        orc.play('piano', bus.piano.input, t, { midi: m, layer: 0, vel: 1.0, dur: len * beat + 0.3, release: 0.8, pan: 0.15, jitter: 0.015 });
        if (at === 0) orc.play('piano', bus.piano.input, t + 0.02, { midi: m - 12, layer: 0, vel: 0.6, dur: beat * 3, release: 0.8, pan: -0.1 });
      }
    }
    // Akor: aşağıdan yukarı hafifçe bozulmuş (piyanist üç notaya aynı anda basmaz).
    const chord = PIANO_CHORDS[loopBar];
    if (chord && step === 0 && T < 0.85) {
      const dur = beat * (deepBreath ? 1.5 : 4) - 0.05;
      chord.forEach((m, k) => orc.play('piano', bus.piano.input, t + k * 0.018, { midi: m, layer: 0, vel: 0.5, dur, release: 0.9, pan: (k - 1) * 0.2, jitter: 0.008 }));
    }
    // Kıyamet: gerilim yüksekken iki ölçüde bir, ölçü başında alçak oktav. (Önce
    // yalnız 1. ve 5. ölçüdeydi; gerilim çoğu zaman döngünün ortasında yükseldiği
    // için duyulmadan geçiyordu.)
    if (T > 0.6 && step === 0 && loopBar % 2 === 0) {
      for (const m of [b.bass, b.bass + 12]) orc.play('pianoLow', bus.piano.input, t, { midi: m, layer: 1, vel: 0.9, dur: beat * 4, release: 1.2, jitter: 0.004 });
    }

    // Gerilimde keman tremolosu: ölçü boyu tek nota; tek geçişlerde yarım
    // ölçüde yarım ses aşağı kayar (kromatik sızı).
    if (lv.trem > 0 && !(deepBreath && step >= 6)) {
      if (step === 0) orc.play('vlnTrem', bus.trem.input, t, { midi: b.trem, vel: 0.8, dur: beat * (pass % 2 ? (last ? 1.25 : 2) : 4) + 0.1, release: 0.5, pan: -0.15 });
      if (step === 8 && pass % 2) orc.play('vlnTrem', bus.trem.input, t, { midi: b.trem - 1, vel: 0.8, dur: beat * 2 + 0.1, release: 0.5, pan: -0.15 });
    }

    // Kalp atışı: yumuşak taiko "lub-dub"; gerilim artınca ölçüde iki atış.
    // Derin nefeste müzik susar, kalp atmaya devam eder.
    if (lv.drums > 0) {
      const beats = T > 0.6 ? [0, 3, 8, 11] : [0, 3];
      if (beats.includes(step)) {
        const dub = step % 8 === 3;
        orc.play('taiko', bus.drums.input, t, { vel: dub ? 0.4 : 0.6, layer: 0, jitter: 0.004 });
      }
      if (step === 0 && T > 0.5) orc.play('timp', bus.drums.input, t, { midi: b.bass + 12 < 41 ? b.bass + 24 : b.bass + 12, vel: 0.45, layer: 0 });
      if (step === 0 && T > 0.75) orc.play('bdrum', bus.drums.input, t, { vel: 0.45, layer: 0 });
      // Son ölçüde gürleyen timpani (çift geçişlerde): döngü başına ya da savaşa çeker.
      if (T > 0.6 && last && !deepBreath && step >= 8) {
        for (let k = 0; k < 2; k++) {
          const v = 0.2 + 0.5 * ((step - 8 + k / 2) / 8);
          orc.play('timp', bus.drums.input, t + (k * dt) / 2, { midi: 47, vel: v, layer: v > 0.5 ? 1 : 0 });
        }
      }
    }
  }
}

/**
 * 56 saniyelik gösteri, iki döngü geçişi: ilk geçiş barış (keman ağıdı),
 * ikinci geçiş farklı çalar (önce boşluk, sonra karşı ezgi) ve gerilim son
 * dört ölçüde 0.35 → 1'e çıkar (kalp atışı, tremolo, nabız). El hızı 0.15 → 0.5.
 */
export const PEACE_DEMO = {
  bars: 16,
  seconds: 56,
  level: (x) => (x < 12 ? 0 : [0.35, 0.6, 0.8, 1][Math.min(3, Math.floor(x - 12))]),
  micro: (x) => 0.15 + 0.35 * clamp01(x / 15.5),
};
