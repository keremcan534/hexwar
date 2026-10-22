// Beste atölyesi: oyuncunun (Kerem'in) yazdığı parçayı çalar (bkz. besteci.html).
//
// Şarkı düz bir JSON'dur; atölye onu düzenler, bu dosya çalar:
//   { v, title, tempo, sections: { A: Section, B, C, D }, order: ['A','B',...] }
//   Section = { chords: [4 akor adı], drums, bass, guitar, piano, lead, power, melody }
//   melody  = [[başlangıç adımı 0-63, MIDI, süre (adım)], ...]   (4 ölçü × 16)
// Bölüm 4 ölçüdür; sıra bölümleri arka arkaya dizer, sonunda başa döner.
//
// Partisyon her adımda şarkıya YENİDEN bakar: çalarken yapılan değişiklik bir
// sonraki adımda duyulur (atölyede dene-dinle döngüsü buna dayanır).
//
// Çalgı stilleri oyunun kendi parçalarından alınmıştır (aynı kayıtlar, aynı
// amfiler); atölye yeni ses değil, mevcut sesleri dizme özgürlüğü verir.

import { loadOrchestra } from './orchestra.js';
import { makeAmp, makeBassAmp, makeCleanAmp } from './guitar.js';
import { makeMixer, rng, setFaders } from './musicEngine.js';
import { metalKick } from './battleMusic.js';

export const STEPS_PER_SECTION = 64;

// Akor paleti (Mi minör / Sol majör ailesi + uğursuz Fa). bass: bas gitar kökü,
// root: gitar power chord kökü (40-51), tones: orta register üçlü (piyano).
export const CHORDS = {
  Em: { bass: 28, root: 40, tones: [52, 55, 59] },
  G: { bass: 31, root: 43, tones: [55, 59, 62] },
  Am: { bass: 33, root: 45, tones: [57, 60, 64] },
  C: { bass: 36, root: 48, tones: [55, 60, 64] },
  D: { bass: 38, root: 50, tones: [54, 57, 62] },
  Bm: { bass: 35, root: 47, tones: [54, 59, 62] },
  B: { bass: 35, root: 47, tones: [54, 59, 63] },
  F: { bass: 29, root: 41, tones: [53, 57, 60] },
};

// Ezgi ızgarasının satırları: Mi doğal minör (= Sol majör) sesleri, E4-B5; Re#
// (armonik minörün "doğu" rengi) ayrı satır.
export const SCALE_ROWS = [83, 81, 79, 78, 76, 75, 74, 72, 71, 69, 67, 66, 64];
const NAMES = { 0: 'Do', 2: 'Re', 3: 'Re#', 4: 'Mi', 5: 'Fa', 6: 'Fa#', 7: 'Sol', 9: 'La', 11: 'Si' };
export const noteName = (m) => `${NAMES[m % 12] ?? '?'}${Math.floor(m / 12) - 1}`;

export const STYLES = {
  drums: { yok: 'Yok', adim: 'Taiko adımı', kalp: 'Kalp atışı', savas: 'Savaş (kick + trampet)', cift: 'Çift kick', timpani: 'Timpani' },
  bass: { yok: 'Yok', uzun: 'Uzun kök', sekizlik: 'Sekizlik', dortnal: 'Dörtnal' },
  guitar: { yok: 'Yok', arpej: 'Temiz arpej', cug: 'Çug (palm mute)', vurus: 'Vuruş + çug', cinlayan: 'Çınlayan akor' },
  piano: { yok: 'Yok', akor: 'Akor', kirik: 'Kırık akor', alcak: 'Alçak oktav' },
  lead: { vln: 'Keman', piano: 'Piyano', lead: 'Lead gitar', yok: 'Ezgi yok' },
};

const section = (chords, drums, bass, guitar, piano, lead, power, melody) => ({ chords, drums, bass, guitar, piano, lead, power, melody });
// [ölçü, vuruş, süre(vuruş), MIDI] → [adım, MIDI, süre(adım)]
const notes = (list) => list.map(([b, at, len, m]) => [b * 16 + Math.round(at * 4), m, Math.round(len * 4)]);

/** Atölyenin ilk açılışta yüklediği örnek: her stil bir yerde duyulsun. */
export function demoSong() {
  return {
    v: 1,
    title: 'Örnek: Ateşten Önce',
    tempo: 100,
    sections: {
      A: section(['Em', 'C', 'Am', 'B'], 'kalp', 'uzun', 'yok', 'akor', 'yok', 0.3, []),
      B: section(['Em', 'C', 'D', 'Em'], 'timpani', 'uzun', 'arpej', 'yok', 'vln', 0.4, notes([
        [0, 1, 1, 71], [0, 2, 1.5, 76], [0, 3.5, 0.5, 78], [1, 0, 2, 79], [1, 2, 1, 78], [1, 3, 1, 76],
        [2, 0, 3, 78], [2, 3, 1, 74], [3, 0, 2, 74], [3, 2, 2, 71]])),
      C: section(['C', 'D', 'Em', 'C'], 'savas', 'sekizlik', 'vurus', 'yok', 'lead', 0.9, notes([
        [0, 0, 1.5, 76], [0, 1.5, 0.5, 74], [0, 2, 1, 72], [0, 3, 1, 71], [1, 0, 1.5, 69], [1, 1.5, 0.5, 71],
        [1, 2, 1, 74], [1, 3, 1, 78], [2, 0, 3, 79], [2, 3, 0.5, 78], [2, 3.5, 0.5, 76], [3, 0, 1.5, 76],
        [3, 1.5, 0.5, 79], [3, 2, 1, 76], [3, 3, 1, 72]])),
      D: section(['Em', 'Am', 'B', 'Em'], 'yok', 'uzun', 'yok', 'kirik', 'vln', 0.3, notes([
        [0, 0, 4, 76], [1, 0, 4, 72], [2, 0, 4, 75], [3, 0, 4, 76]])),
    },
    order: ['A', 'B', 'C', 'B', 'D'],
  };
}

/** Bozuk ya da eski kayıttan güvenli şarkı: eksik alanlar örnekten tamamlanır. */
export function normalizeSong(raw) {
  const base = demoSong();
  const s = raw && typeof raw === 'object' ? raw : {};
  const out = { v: 1, title: String(s.title ?? base.title).slice(0, 60), tempo: Math.min(170, Math.max(50, Number(s.tempo) || base.tempo)), sections: {}, order: [] };
  for (const k of ['A', 'B', 'C', 'D']) {
    const src = s.sections?.[k] ?? base.sections[k];
    const pick = (field, table) => (src[field] in table ? src[field] : base.sections[k][field]);
    out.sections[k] = {
      chords: [0, 1, 2, 3].map((i) => (src.chords?.[i] in CHORDS ? src.chords[i] : 'Em')),
      drums: pick('drums', STYLES.drums),
      bass: pick('bass', STYLES.bass),
      guitar: pick('guitar', STYLES.guitar),
      piano: pick('piano', STYLES.piano),
      lead: pick('lead', STYLES.lead),
      power: Math.min(1, Math.max(0, Number(src.power ?? 0.5))),
      melody: (Array.isArray(src.melody) ? src.melody : [])
        .filter((n) => Array.isArray(n) && n[0] >= 0 && n[0] < STEPS_PER_SECTION && SCALE_ROWS.includes(n[1]))
        .map(([st, m, l]) => [st | 0, m, Math.max(1, Math.min(STEPS_PER_SECTION - st, l | 0))]),
    };
  }
  out.order = (Array.isArray(s.order) ? s.order : base.order).filter((k) => k in out.sections).slice(0, 64);
  if (!out.order.length) out.order = ['A'];
  return out;
}

// Bölük → [düzey, yankı payı]: oyunun parçalarındaki ölçülmüş dengeye yakın.
const BUSES = {
  drums: [1.6, 0.25],
  kick: [0.9, 0.04],
  snare: [2.0, 0.35],
  bass: [0.9, 0.05],
  gtr: [0.35, 0.1],
  clean: [0.8, 0.4],
  piano: [1.0, 0.35],
  mel: [1.4, 0.45],
};

const GALLOP = new Set([0, 2, 3, 4, 6, 7, 8, 10, 11, 12, 14, 15]);
const power = (root) => [root, root + 7, root + 12];
const timpNote = (m) => (m < 41 ? m + 12 : m > 55 ? m - 12 : m);

/** Akorun sekizlik arpeji: kök, beşli, oktav, üstündeki iki akor sesi, geri. */
function arp(chord) {
  const r = chord.root;
  const pcs = new Set(chord.tones.map((m) => m % 12));
  const above = [];
  for (let m = r + 13; above.length < 2 && m < r + 30; m++) if (pcs.has(m % 12)) above.push(m);
  return [r, r + 7, r + 12, above[0], above[1], above[0], r + 12, r + 7];
}

/**
 * Şarkıya bağlı partisyon sınıfı üretir. MusicPlayer statik alanları okur;
 * BARS ve tempo şarkıdan canlı gelir (sıra ya da tempo çalarken değişebilir).
 */
export function makeUserScore(song) {
  class UserScore {
    static get BARS() { return song.order.length * 4; }
    static tempoFor() { return song.tempo; }
    static layerLevels() { return {}; }

    static async create(ctx, dest) {
      return new UserScore(ctx, dest, await loadOrchestra(ctx));
    }

    constructor(ctx, dest, orchestra) {
      this.ctx = ctx;
      this.orc = orchestra;
      const { master, bus } = makeMixer(ctx, dest, BUSES);
      setFaders(bus, Object.fromEntries(Object.keys(BUSES).map((k) => [k, 1])), ctx.currentTime, 0.01);
      const side = (pan) => {
        const amp = makeAmp(ctx);
        const p = ctx.createStereoPanner();
        p.pan.value = pan;
        amp.output.connect(p).connect(bus.gtr.input);
        return amp;
      };
      const clean = makeCleanAmp(ctx);
      clean.output.connect(bus.clean.input);
      const bassAmp = makeBassAmp(ctx);
      bassAmp.output.connect(bus.bass.input);
      const leadAmp = makeAmp(ctx, { lead: true });
      leadAmp.output.connect(bus.mel.input);
      Object.assign(this, { master, bus, gtrL: side(-0.85), gtrR: side(0.85), cleanIn: clean.input, bassIn: bassAmp.input, leadIn: leadAmp.input });
      this.rand = rng(1923);
      this.song = song;
    }

    /** Şu an çalan bölüm ve içindeki ölçü (atölye çalma imlecini buradan çizer). */
    static locate(bar) {
      const total = song.order.length * 4;
      const b = ((bar % total) + total) % total;
      const slot = Math.floor(b / 4);
      return { slot, key: song.order[slot], sectionBar: b % 4 };
    }

    distorted(t, midis, muted, o) {
      const strum = muted ? 0.002 : 0.007;
      const each = o.vel / Math.sqrt(midis.length);
      for (const [amp, lag] of [[this.gtrL, 0], [this.gtrR, 0.006 + 0.008 * this.rand()]]) {
        const side = muted ? amp.muteInput : amp.input;
        midis.forEach((m, k) => this.orc.play('gtr', side, t + lag + k * strum, { ...o, midi: m, vel: each, jitter: 0.002 }));
      }
    }

    scheduleStep(t, dt, bar, step) {
      const { orc, bus } = this;
      const { key, sectionBar } = UserScore.locate(bar);
      const sec = song.sections[key];
      if (!sec) return;
      const chord = CHORDS[sec.chords[sectionBar]] ?? CHORDS.Em;
      const P = sec.power;
      const beat = dt * 4;
      const r = this.rand;
      const lastBar = sectionBar === 3;
      const play = (inst, b, o) => orc.play(inst, bus[b].input, t, o);

      // Davul.
      switch (sec.drums) {
        case 'adim': {
          const v = { 0: 1, 4: 0.55, 8: 0.8, 12: 0.55 }[step];
          if (v) play('taiko', 'drums', { vel: v * (0.6 + 0.4 * P), layer: v > 0.7 ? 1 : 0 });
          if (step === 0 && P > 0.5) play('bdrum', 'drums', { vel: 0.4 + 0.4 * P, layer: P > 0.75 ? 1 : 0 });
          break;
        }
        case 'kalp':
          if (step === 0 || step === 3) play('taiko', 'drums', { vel: step ? 0.4 : 0.6, layer: 0 });
          if (P > 0.6 && (step === 8 || step === 11)) play('taiko', 'drums', { vel: step === 11 ? 0.4 : 0.6, layer: 0 });
          break;
        case 'savas':
        case 'cift': {
          const dbl = sec.drums === 'cift';
          if (dbl || step === 0 || step === 8 || (P > 0.6 && (step === 6 || step === 10))) metalKick(this.ctx, bus.kick.input, t, step % 2 ? 0.8 : 1);
          if (step === 4 || step === 12) play('snare', 'snare', { vel: 0.7 + 0.3 * P, layer: 2, jitter: 0.004 });
          else if (lastBar && step > 12) play('snare', 'snare', { vel: 0.5 + 0.1 * (step - 12), layer: 1, jitter: 0.004 });
          if (step === 0) play('taiko', 'drums', { vel: 0.6 + 0.4 * P, layer: 1 });
          break;
        }
        case 'timpani':
          if (step === 0) play('timp', 'drums', { midi: timpNote(chord.root), vel: 0.5 + 0.4 * P, layer: 1 });
          if (lastBar && step >= 8) {
            for (let k = 0; k < 2; k++) {
              const v = 0.2 + 0.5 * ((step - 8 + k / 2) / 8);
              orc.play('timp', bus.drums.input, t + (k * dt) / 2, { midi: timpNote(chord.root), vel: v, layer: v > 0.5 ? 1 : 0 });
            }
          }
          break;
      }

      // Bas.
      const bassVel = 0.6 + 0.3 * P;
      if (sec.bass === 'uzun' && step === 0) orc.play('bass', this.bassIn, t, { midi: chord.bass, vel: bassVel, dur: beat * 4 - 0.05, release: 0.5 });
      if (sec.bass === 'sekizlik' && step % 2 === 0) orc.play('bass', this.bassIn, t, { midi: chord.bass, vel: bassVel * (step % 4 ? 0.8 : 1), dur: dt * 1.6, release: 0.05, jitter: 0.003 });
      if (sec.bass === 'dortnal' && GALLOP.has(step)) orc.play('bass', this.bassIn, t, { midi: chord.bass, vel: bassVel * (step % 4 ? 0.75 : 1), dur: dt * 0.95, release: 0.04, jitter: 0.003 });

      // Gitar.
      const pc = power(chord.root);
      switch (sec.guitar) {
        case 'arpej':
          if (step % 2 === 0) {
            const i = step / 2;
            orc.play(['gtr', 'lead'], this.cleanIn, t, { midi: arp(chord)[i], vel: (i ? 0.55 : 0.75) + 0.06 * r(), dur: beat * 1.6, release: 0.5, pan: i % 2 ? 0.3 : -0.3, jitter: 0.012 });
          }
          break;
        case 'cug':
          if (step === 0) this.distorted(t, pc, false, { vel: 0.9, dur: dt * 2 - 0.01, release: 0.05 });
          else if (step % 2 === 0 || (P > 0.7 && GALLOP.has(step))) this.distorted(t, [chord.root, chord.root + 7], true, { vel: 0.8 * (0.93 + 0.07 * r()), dur: dt * 0.95, release: 0.03 });
          break;
        case 'vurus':
          if (step === 0 || step === 6 || step === 12) this.distorted(t, pc, false, { vel: 0.95, dur: dt * 2 - 0.01, release: 0.05 });
          else if (GALLOP.has(step)) this.distorted(t, [chord.root, chord.root + 7], true, { vel: 0.8 * (0.93 + 0.07 * r()), dur: dt * 0.95, release: 0.03 });
          break;
        case 'cinlayan':
          if (step === 0 || step === 8) this.distorted(t, pc, false, { vel: 0.9, dur: dt * 7.5, release: 0.25 });
          break;
      }

      // Piyano.
      const piano = (midi, o) => orc.play(['pianoLow', 'piano'], bus.piano.input, t, { midi, layer: P > 0.6 ? 1 : 0, release: 0.8, jitter: 0.01, ...o });
      if (sec.piano === 'akor' && step === 0) chord.tones.forEach((m, k) => orc.play('piano', bus.piano.input, t + k * 0.018, { midi: m, layer: 0, vel: 0.55, dur: beat * 4 - 0.05, release: 0.9 }));
      if (sec.piano === 'kirik' && step % 4 === 0) piano(chord.tones[[0, 1, 2, 1][step / 4]], { vel: step ? 0.5 : 0.62, dur: beat * 1.6 });
      if (sec.piano === 'alcak' && (step === 0 || step === 8)) for (const m of [chord.bass + 12, chord.bass + 24]) piano(m, { vel: step ? 0.6 : 0.8, dur: beat * 2 - 0.05 });

      // Ezgi: bu adımda başlayan notalar.
      if (sec.lead !== 'yok') {
        const at = sectionBar * 16 + step;
        for (const [st, m, len] of sec.melody) {
          if (st !== at) continue;
          const dur = len * dt + 0.06;
          if (sec.lead === 'vln') orc.play('vln', bus.mel.input, t, { midi: m, layer: P > 0.5 ? 1 : 0, vel: P > 0.5 ? 0.8 : 1.9, dur, release: 0.5, jitter: 0.015 });
          else if (sec.lead === 'piano') orc.play('piano', bus.mel.input, t, { midi: m, layer: P > 0.5 ? 1 : 0, vel: 0.85, dur: dur + 0.3, release: 0.8, jitter: 0.01 });
          else orc.play('lead', this.leadIn, t, { midi: m, vel: 0.9, dur, release: 0.12, jitter: 0.004 });
        }
      }
    }
  }
  return UserScore;
}
