// Elektro gitar ve bas gitar amfisi + kabin.
//
// Gitar ve bas notaları gerçek DI kayıttır (Karoryfer, CC0; bkz.
// scripts/audio/build-orchestra.mjs) ve orchestra.js ile çalınır; burada
// yalnız amfi var. DI kayıt amfisiz "tın tın" çalar; bozulma ve kabin
// süzgeci ona elektro gitar sesini verir. Önce teli de sentezliyorduk
// (Karplus-Strong): Kerem "testere sesi / hâlâ yapay" dedi, gerçek kayda geçildi.
//
// Ritim amfisinin sesi ön ayarlarla seçilir (AMP_PRESETS); varsayılan orta
// kazanç (crunch): yüksek kazançta 2-4 kHz bandı karışımın en güçlü bandı
// oluyordu ve Kerem "normal gitar daha iyi" dedi.

function shaper(ctx, fn) {
  const ws = ctx.createWaveShaper();
  const n = 8192;
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) c[i] = fn((i / (n - 1)) * 2 - 1);
  ws.curve = c;
  ws.oversample = '4x';
  return ws;
}

function biquad(ctx, type, f, q = 0.707, gain = 0) {
  const b = ctx.createBiquadFilter();
  b.type = type;
  b.frequency.value = f;
  b.Q.value = q;
  b.gain.value = gain;
  return b;
}

const chain = (nodes) => nodes.reduce((a, b) => (a.connect(b), b));

/**
 * Ritim amfisinin ön ayarları. Kerem gitarı kulakla değerlendiriyor ve
 * ölçüm "kötü"nün ne olduğunu söylemiyor (bant dengesi iki ayarda da benzer):
 * seçim ona bırakıldı, lab'da canlı ve A/B dökümünde yan yana.
 *   kranc  — orta kazanç, bozulmadan önce "tube screamer" eğrisi (180 Hz altı
 *            kesik, 750 Hz tümsek: alt tel gövdesi amfide çamura döner, metal
 *            sesinin sıkılığı bu ön süzgeçtendir), kabinde 110 Hz rezonans ve
 *            2.4 kHz varlık tepesi
 *   siki   — daha çok orta itişi ve varlık, daha parlak kabin
 *   agir   — yüksek kazanç
 *   eski   — "testere" şikâyetinden sonraki karanlık ayar (karşılaştırma için)
 * Bozan eğriler sabit; ön ayar yalnız kazanç ve süzgeç değerleridir, böylece
 * geçiş zamanlanabilir (setValueAtTime) — çevrimdışı A/B dökümü buna dayanır.
 * Palm mute yolu: kütüphanede palm mute kaydı yok, kısa (staccato) çalım
 * parlak bir kesik notadır; avuçla boğulmuş tel ise tok ve karanlıktır.
 * Bozulmadan önce 1 kHz üstü kesilip 140 Hz "tok"u yükseltilir.
 */
export const AMP_PRESETS = {
  kranc: { hp: 180, humpF: 750, humpG: 5, pre: 4, lp1: 5000, mid: 2, res: 2.5, scoop: -3, presF: 2400, presG: 2.5, lpA: 4800, lpB: 5600, lpC: 6500, out: 0.55, muteLp: 1000, thump: 5, muteGain: 1.3 },
  siki: { hp: 220, humpF: 800, humpG: 7, pre: 5, lp1: 6000, mid: 2.2, res: 2, scoop: -4, presF: 2700, presG: 4, lpA: 5500, lpB: 6200, lpC: 7500, out: 0.5, muteLp: 1100, thump: 5, muteGain: 1.3 },
  agir: { hp: 200, humpF: 750, humpG: 6, pre: 9, lp1: 5000, mid: 3.2, res: 3, scoop: -4, presF: 2300, presG: 2.5, lpA: 5000, lpB: 5600, lpC: 6500, out: 0.45, muteLp: 1000, thump: 5, muteGain: 1.3 },
  eski: { hp: 140, humpF: 700, humpG: 2, pre: 4, lp1: 4500, mid: 2, res: 0, scoop: -2, presF: 3000, presG: -3, lpA: 3800, lpB: 4200, lpC: 5000, out: 0.55, muteLp: 20000, thump: 0, muteGain: 1 },
};
export const AMP_PRESET_NAMES = { kranc: 'Kranç (şimdiki)', siki: 'Sıkı / parlak', agir: 'Ağır (yüksek kazanç)', eski: 'Eski karanlık' };

// Ritim amfileri ortak ön ayarı izler; yeni kurulan amfi seçili olanla doğar.
let currentPreset = 'kranc';
const liveAmps = new Set();

/** Bütün ritim amfilerini `name` ön ayarına geçir (t verilirse o anda). */
export function setAmpPreset(name, t = null) {
  if (!AMP_PRESETS[name]) return;
  currentPreset = name;
  for (const ref of liveAmps) {
    const amp = ref.deref();
    if (amp) amp.setPreset(name, t);
    else liveAmps.delete(ref);
  }
}
export const ampPreset = () => currentPreset;

/** Gitar amfisi + 4x12 kabin. `lead` ön ayardan bağımsız, orta ağırlıklı sabit ses. */
export function makeAmp(ctx, { lead = false } = {}) {
  const input = ctx.createGain();
  const output = ctx.createGain();
  const pre = ctx.createGain();
  const mid = ctx.createGain();
  // Kademe 1 asimetrik (lamba gibi çift harmonik), kademe 2 yumuşak.
  const stage1 = shaper(ctx, (x) => (x >= 0 ? Math.tanh(1.2 * x) : 0.85 * Math.tanh(1.5 * x)));
  const stage2 = shaper(ctx, (x) => Math.tanh(1.2 * x));
  const n = {
    hp: biquad(ctx, 'highpass', 180),
    hump: biquad(ctx, 'peaking', 750, 0.9, 5),
    lp1: biquad(ctx, 'lowpass', 5000),
    res: biquad(ctx, 'peaking', 110, 1.2, 2.5),
    scoop: biquad(ctx, 'peaking', 450, 1, -3),
    pres: biquad(ctx, 'peaking', 2400, 1, 2.5),
    lpA: biquad(ctx, 'lowpass', 4800, 0.7),
    lpB: biquad(ctx, 'lowpass', 5600, 0.6),
    lpC: biquad(ctx, 'lowpass', 6500, 0.6),
    muteLp: biquad(ctx, 'lowpass', 1000, 0.6),
    thump: biquad(ctx, 'peaking', 140, 1, 5),
  };
  chain([input, n.hp, n.hump, pre, stage1, n.lp1, mid, stage2, biquad(ctx, 'highpass', 75), n.res, n.scoop, n.pres, n.lpA, n.lpB, n.lpC, output]);
  const muteInput = ctx.createGain();
  chain([muteInput, n.muteLp, n.thump, input]);

  const set = (param, v, t) => (t == null ? (param.value = v) : param.setValueAtTime(v, t));
  const amp = {
    input,
    muteInput,
    output,
    setPreset(name, t = null) {
      const p = lead ? { ...AMP_PRESETS.kranc, hp: 220, pre: 3, mid: 1.6, res: 0, out: 0.5 } : AMP_PRESETS[name];
      set(n.hp.frequency, p.hp, t);
      set(n.hump.frequency, p.humpF, t);
      set(n.hump.gain, p.humpG, t);
      set(pre.gain, p.pre, t);
      set(n.lp1.frequency, p.lp1, t);
      set(mid.gain, p.mid, t);
      set(n.res.gain, p.res, t);
      set(n.scoop.gain, p.scoop, t);
      set(n.pres.frequency, p.presF, t);
      set(n.pres.gain, p.presG, t);
      set(n.lpA.frequency, p.lpA, t);
      set(n.lpB.frequency, p.lpB, t);
      set(n.lpC.frequency, p.lpC, t);
      set(output.gain, p.out, t);
      set(n.muteLp.frequency, p.muteLp, t);
      set(n.thump.gain, p.thump, t);
      set(muteInput.gain, p.muteGain, t);
    },
  };
  amp.setPreset(currentPreset);
  if (!lead) liveAmps.add(new WeakRef(amp));
  return amp;
}

/**
 * Temiz amfi (barış parçası): bozulma yok. DI kaydın çamurlu 200 Hz'i
 * oyulur, 2.5 kHz'e hafif parıltı, 8 kHz üstü kesilir (DI'nin pena tıkırtısı
 * kabinsiz kulağa batar). Hafif sıkıştırma arpejin notalarını eşitler.
 */
export function makeCleanAmp(ctx) {
  const input = ctx.createGain();
  const output = ctx.createGain();
  output.gain.value = 0.8;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -20;
  comp.ratio.value = 3;
  comp.attack.value = 0.01;
  comp.release.value = 0.2;
  chain([
    input,
    biquad(ctx, 'highpass', 90),
    biquad(ctx, 'peaking', 220, 1, -3),
    biquad(ctx, 'peaking', 2500, 0.8, 2),
    biquad(ctx, 'lowpass', 8000, 0.7),
    comp,
    output,
  ]);
  return { input, output };
}

/** Bas amfisi: temiz alt (yer sarsıntısı) + az kir (gitarın içinde duyulsun diye). */
export function makeBassAmp(ctx) {
  const input = ctx.createGain();
  const output = ctx.createGain();
  output.gain.value = 1.2;
  chain([input, biquad(ctx, 'lowpass', 260), output]);
  const drive = ctx.createGain();
  drive.gain.value = 5;
  const dirt = ctx.createGain();
  dirt.gain.value = 0.1;
  chain([input, biquad(ctx, 'highpass', 220), drive, shaper(ctx, (x) => Math.tanh(1.2 * x)), biquad(ctx, 'lowpass', 1500), dirt, output]);
  return { input, output };
}
