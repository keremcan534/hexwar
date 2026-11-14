// ARAYÜZ SESLERİ — düğme tıkı, sekme mandalı, onay mührü, ret, keşif çanı.
//
// Neden kodla üretiliyor (dosya yok): ses dosyası lisans ister (bkz.
// ambience.js lisans notu) ve her biri ayrı ağ isteğidir. Bu sesler 30-1400
// ms'lik kısa darbeler; Web Audio'nun gürültü + süzgeç + zarfıyla birkaç
// düğümde kurulur. Tarifler bağlam ve hedef alır: aynı tarif çevrimdışı
// bağlamda WAV'a dökülüp dinletilebilir (bkz. renderSound).
//
// Neden ayrı ses düzeyi: arayüz sesi zevk meselesidir; müzik ve ambiyansla
// birlikte kısılmak zorunda olmamalı. Settings'te kendi satırı var.
//
// Neden tek yakalayıcı: düğmeler ekran ekran innerHTML'le yeniden kurulur
// (bkz. tooltip.js notu); her düğmeye dinleyici bağlamak yerine belge
// düzeyinde tıklama yakalanır, sesi düğmenin ROLÜ seçer (sekme, onay, olağan).
//
// Katman notu: ui katmanı; oyun durumunu okumaz, oyuna yazmaz.

const VOLUME_KEY = 'hexwar:ui-volume';
const MUTE_KEY = 'hexwar:ui-muted';
const DEFAULT_VOLUME = 55;
/** Aynı ses bu aralıktan sık çalmaz: hızlı tıklama makineli tüfeğe dönmesin. */
const MIN_GAP_S = 0.03;

const NOISE = new WeakMap();

/** Bağlam başına bir gürültü tamponu. Tohumlu: WAV dökümü her seferinde aynı. */
function noiseBuffer(ctx) {
  let buf = NOISE.get(ctx);
  if (buf) return buf;
  const len = Math.round(ctx.sampleRate * 0.6);
  buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  let seed = 0x2f6b1d;
  for (let i = 0; i < len; i++) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    data[i] = (seed / 4294967296) * 2 - 1;
  }
  NOISE.set(ctx, buf);
  return buf;
}

/** Üstel zarf: sıfır yerine 1e-4'ten başlar (üstel rampa sıfıra gidemez). */
function envelope(param, t, attack, dur, peak) {
  param.setValueAtTime(0.0001, t);
  param.exponentialRampToValueAtTime(peak, t + attack);
  param.exponentialRampToValueAtTime(0.0001, t + dur);
}

/** Süzülmüş gürültü darbesi: tıkın, kâğıdın, mekanizmanın gövdesi. */
function burst(ctx, out, t, { dur, freq, endFreq = 0, q = 1, type = 'bandpass', gain, attack = 0.001, offset = 0 }) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx);
  const filter = ctx.createBiquadFilter();
  filter.type = type;
  filter.frequency.setValueAtTime(freq, t);
  if (endFreq) filter.frequency.exponentialRampToValueAtTime(endFreq, t + dur);
  filter.Q.value = q;
  const g = ctx.createGain();
  envelope(g.gain, t, attack, dur, gain);
  src.connect(filter).connect(g).connect(out);
  src.start(t, offset);
  src.stop(t + dur + 0.05);
}

/** Ton: tokmağın gümbürtüsü, metalin çınlaması, çanın kısmileri. */
function tone(ctx, out, t, { freq, endFreq = 0, dur, gain, type = 'sine', attack = 0.002 }) {
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (endFreq) osc.frequency.exponentialRampToValueAtTime(endFreq, t + dur);
  const g = ctx.createGain();
  envelope(g.gain, t, attack, dur, gain);
  osc.connect(g).connect(out);
  osc.start(t);
  osc.stop(t + dur + 0.05);
}

/**
 * Tarifler. Kazançlar doğrusal genlik; genel düzeyi ana kazanç belirler.
 * Her biri kendi süresini döndürür (WAV dökümü ne kadar kaydedeceğini bilsin).
 */
export const SOUNDS = {
  // Olağan düğme: kısa, kuru bir "tok" — pirinç kasanın tıkı.
  click(ctx, out, t) {
    burst(ctx, out, t, { dur: 0.035, freq: 2600, q: 1.4, gain: 0.35 });
    tone(ctx, out, t, { freq: 190, endFreq: 120, dur: 0.045, gain: 0.18 });
    return 0.1;
  },
  // Sekme: mandal — iki tık ve ince bir metal çınlaması.
  // Seviye tıkla dengeli (tepe ~0.15): ilk hâli 0.065'te kalıyordu, en sık
  // basılan şeyin sesi en zayıf olandı (WAV dökümüyle ölçüldü).
  tab(ctx, out, t) {
    burst(ctx, out, t, { dur: 0.03, freq: 1700, q: 1.2, gain: 0.62 });
    burst(ctx, out, t + 0.045, { dur: 0.035, freq: 3300, q: 2, gain: 0.48, offset: 0.1 });
    tone(ctx, out, t + 0.045, { freq: 1240, dur: 0.14, gain: 0.08, type: 'triangle' });
    return 0.25;
  },
  // Onay (yasa, araştırma, birincil eylem): mühür — tok gümbürtü + kâğıt.
  confirm(ctx, out, t) {
    tone(ctx, out, t, { freq: 105, endFreq: 58, dur: 0.2, gain: 0.45 });
    burst(ctx, out, t, { dur: 0.07, freq: 900, q: 0.7, type: 'lowpass', gain: 0.3, offset: 0.2 });
    burst(ctx, out, t + 0.01, { dur: 0.02, freq: 3000, q: 1, gain: 0.12, offset: 0.3 });
    return 0.3;
  },
  // Kapalı düğme: boğuk, alçak bir "tonk" — olmuyor, ama kızmadan.
  deny(ctx, out, t) {
    tone(ctx, out, t, { freq: 150, endFreq: 110, dur: 0.09, gain: 0.2, type: 'triangle' });
    burst(ctx, out, t, { dur: 0.03, freq: 600, q: 0.8, type: 'lowpass', gain: 0.12, offset: 0.4 });
    return 0.15;
  },
  // Keşif: yükselen dört notalı çan (Mi majör arpej), yumuşak parıltıyla.
  discovery(ctx, out, t) {
    const notes = [659.25, 830.61, 987.77, 1318.51];
    notes.forEach((f, i) => {
      const at = t + i * 0.11;
      tone(ctx, out, at, { freq: f, dur: 1.4, gain: 0.14, attack: 0.004 });
      tone(ctx, out, at, { freq: f * 2.76, dur: 0.6, gain: 0.045, attack: 0.002 });
      tone(ctx, out, at, { freq: f * 5.4, dur: 0.25, gain: 0.018, attack: 0.001 });
    });
    burst(ctx, out, t + 0.05, { dur: 0.6, freq: 6000, q: 0.5, type: 'highpass', gain: 0.035, attack: 0.08, offset: 0.05 });
    return 1.9;
  },
};

/**
 * Bir tarifi çevrimdışı bağlamda çalıp örnekleri döndürür (sınama ve
 * dinletme: başsız tarayıcıda WAV'a dökülür, hoparlör gerekmez).
 */
export async function renderSound(name, sampleRate = 48000) {
  const recipe = SOUNDS[name];
  if (!recipe) return null;
  const probe = new OfflineAudioContext(1, sampleRate, sampleRate);
  const seconds = recipe(probe, probe.destination, 0) + 0.1;
  const ctx = new OfflineAudioContext(1, Math.ceil(seconds * sampleRate), sampleRate);
  const master = ctx.createGain();
  master.gain.value = 0.7;
  master.connect(ctx.destination);
  recipe(ctx, master, 0.02);
  const buffer = await ctx.startRendering();
  return buffer.getChannelData(0);
}

export class UiSound {
  constructor() {
    this.volume = readNumber(VOLUME_KEY, DEFAULT_VOLUME);
    this.muted = readFlag(MUTE_KEY);
    this.ctx = null;
    this.master = null;
    this.last = {};
    this.bind();
    this.mountSettings();
  }

  /**
   * Bağlam ilk sesle kurulur: arayüz sesi hep bir tıklamanın sonucu olduğu
   * için tarayıcının "kullanıcı dokunmadan ses yok" kuralı kendiliğinden
   * sağlanır (keşif çanı da oyuncu en az bir kez tıkladıktan sonra çalar).
   */
  boot() {
    if (this.ctx) return this.ctx;
    const Ctx = globalThis.AudioContext ?? globalThis.webkitAudioContext;
    if (!Ctx || !navigator.userActivation?.hasBeenActive) return null;
    try {
      this.ctx = new Ctx({ sampleRate: 48000, latencyHint: 'interactive' });
    } catch {
      try { this.ctx = new Ctx(); } catch { return null; }
    }
    this.master = this.ctx.createGain();
    this.master.connect(this.ctx.destination);
    this.apply();
    return this.ctx;
  }

  apply() {
    if (!this.master) return;
    this.master.gain.value = this.muted ? 0 : (this.volume / 100) * 0.7;
  }

  play(name) {
    if (this.muted || this.volume <= 0 || document.hidden) return;
    const recipe = SOUNDS[name];
    const ctx = recipe ? this.boot() : null;
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume();
    const now = ctx.currentTime;
    if (now - (this.last[name] ?? -1) < MIN_GAP_S) return;
    this.last[name] = now;
    recipe(ctx, this.master, now + 0.005);
  }

  /** Sesi düğmenin rolü seçer; yakalama evresinde, düğmenin kendi işinden önce. */
  bind() {
    document.addEventListener('click', (event) => {
      const el = event.target.closest?.('button, [role="button"]');
      if (!el || el.disabled) return;
      if (el.matches('.tab-bar [data-screen]')) { this.play('tab'); return; }
      // Kurulu onay (ikinci tık) eylemi YAPAR: mühür. İlk tık yalnız kurar.
      if (el.matches('.confirming')) { this.play('confirm'); return; }
      if (el.matches('.primary, .np-play, .ap-btn.go, [data-tech-now]')
        || (el.matches('.tech-node') && !event.shiftKey)) {
        this.play('confirm');
        return;
      }
      this.play('click');
    }, true);
    // Kapalı düğme tıklama olayı üretmez; işaretçi olayı gelir.
    document.addEventListener('pointerdown', (event) => {
      if (event.button === 0 && event.target.closest?.('button:disabled')) this.play('deny');
    }, true);
  }

  setVolume(value) {
    this.volume = Math.max(0, Math.min(100, Math.round(value)));
    writeValue(VOLUME_KEY, String(this.volume));
    this.apply();
    this.syncSettings();
  }

  setMuted(muted) {
    this.muted = Boolean(muted);
    writeValue(MUTE_KEY, this.muted ? '1' : '0');
    this.apply();
    this.syncSettings();
  }

  /** Settings: ambiyans satırının altına "interface" satırı (aynı kalıp). */
  mountSettings() {
    const panel = document.getElementById('settings');
    if (!panel || panel.querySelector('.ui-sound-settings')) return;
    const box = document.createElement('div');
    box.className = 'ui-sound-settings';
    box.style.display = 'contents';
    const head = document.createElement('div');
    head.className = 'action-row';
    head.style.marginTop = '14px';
    const k = document.createElement('div');
    k.className = 'k';
    k.textContent = 'interface';
    const mute = document.createElement('button');
    mute.className = 'action';
    mute.id = 'btn-ui-sound-mute';
    mute.addEventListener('click', () => this.setMuted(!this.muted));
    head.append(k, mute);
    const label = document.createElement('label');
    label.className = 'field';
    const span = document.createElement('span');
    const val = document.createElement('b');
    span.append('Interface sounds: ', val);
    const input = document.createElement('input');
    input.type = 'range';
    input.id = 'in-ui-sound';
    input.min = '0';
    input.max = '100';
    input.step = '1';
    input.addEventListener('input', () => {
      this.volume = Number(input.value);
      val.textContent = String(this.volume);
      this.apply();
    });
    // Bırakınca bir tık: oyuncu yeni düzeyi duysun.
    input.addEventListener('change', () => {
      this.setVolume(Number(input.value));
      this.play('click');
    });
    label.append(span, input);
    box.append(head, label);
    panel.insertBefore(box, document.getElementById('save-info'));
    this.ui = { mute, input, val };
    this.syncSettings();
  }

  syncSettings() {
    if (!this.ui) return;
    this.ui.input.value = String(this.volume);
    this.ui.val.textContent = this.muted ? 'muted' : String(this.volume);
    this.ui.mute.textContent = this.muted ? 'Unmute interface sounds' : 'Mute interface sounds';
    this.ui.mute.setAttribute('aria-pressed', this.muted ? 'true' : 'false');
  }
}

function readNumber(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    const n = Number(raw);
    return raw != null && Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : fallback;
  } catch {
    return fallback;
  }
}

function readFlag(key) {
  try {
    return localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

function writeValue(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Depolama kapalı (gizli sekme): tercih oturumla sınırlı kalır.
  }
}
