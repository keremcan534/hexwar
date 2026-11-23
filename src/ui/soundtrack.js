// Oyun içi müzik yönetmeni: oyunun hâli hangi bölümün çalacağını seçer.
// Hangi bölümün hangi duyguyu taşıdığı musicScore.js'te, hâlin okunuşu
// musicMood.js'tedir.
//
// Neden böyle kuruldu:
// - Kayıtlar Blob olarak bir kez alınır: bölüm başına atlamak için sunucu
//   Range ister, dev sunucusu ve başlatıcı vermez. Audio elemanı Blob'u yine
//   akıtır; tampona çözülse parça başına ~100 MB bellek tutardı.
// - Kazanç düğümleri Web Audio'da: geçişler eşit güç eğrisiyle örnek hassasiyetinde
//   gider, Audio.volume adımları duyulmaz.
// - Gerilim anında yükselir, birkaç saniye oturunca iner. Haftanın kapanışında
//   durum bir an gidip geldiğinde müzik savrulmasın.
//
// Katman notu: ui katmanı; oyun durumunu okur, oyuna yazmaz.

import { onPeace } from '../game/peace.js';
import { readMusicState } from './musicMood.js';
import { FADES, isWarMood, MOMENTS, MOODS, OUTBREAKS, SECTIONS } from './musicScore.js';
import { TRACKS } from './musicTracks.js';

const TICK_MS = 250;
/** Aynı hafta dilimlenirken durum okuması kare bütçesini yemesin. */
const READ_EVERY_MS = 1500;
const SETTLE_MS = 8000;
const TURN_MS = 10000;
const MISSING_RETRY_S = 8;
const DECK_COUNT = 3;

/** Kayıtları bir kez indirir; dosya yoksa oyun sessiz sürer. */
class Library {
  constructor() {
    this.urls = new Map();
  }

  url(track) {
    if (!this.urls.has(track.id)) {
      this.urls.set(track.id, fetch(track.src)
        .then((res) => (res.ok ? res.blob() : null))
        .then((blob) => (blob ? URL.createObjectURL(blob) : null))
        .catch(() => null));
    }
    return this.urls.get(track.id);
  }
}

/** Tek bölümün çalımı: geçişte iki deste bir an üst üste duyulur. */
class Deck {
  constructor(ctx, output, owner) {
    this.ctx = ctx;
    this.owner = owner;
    this.audio = new Audio();
    this.audio.preload = 'auto';
    this.gain = ctx.createGain();
    this.gain.gain.value = 0;
    ctx.createMediaElementSource(this.audio).connect(this.gain).connect(output);
    this.section = null;
    this.url = null;
    this.ticket = 0;
    this.busy = false;
    this.ending = false;
    this.wantsPlay = false;
    this.stopTimer = 0;
    this.audio.addEventListener('ended', () => owner.sectionEnding(this));
    // Dosya bozuksa oyun sürer: sıradaki deneme aradaki sessizlikten sonra.
    this.audio.addEventListener('error', () => { if (this.busy) owner.sectionEnding(this); });
  }

  /** settingsPanel düzey değişince buradan ister. */
  apply() {
    this.owner.applyLevel();
  }

  /** Eşit güç eğrisi: geçişin ortasında toplam ses düzeyi çukura düşmez. */
  fadeTo(target, seconds) {
    const param = this.gain.gain;
    const now = this.ctx.currentTime;
    const from = param.value;
    param.cancelScheduledValues(now);
    param.setValueAtTime(from, now);
    if (seconds <= 0.02 || Math.abs(target - from) < 0.0005) {
      param.setValueAtTime(target, now);
      return;
    }
    const size = Math.max(16, Math.round(seconds * 60));
    const curve = new Float32Array(size);
    for (let i = 0; i < size; i++) {
      const x = (i / (size - 1)) * (Math.PI / 2);
      curve[i] = target > from
        ? from + (target - from) * Math.sin(x)
        : target + (from - target) * Math.cos(x);
    }
    param.setValueCurveAtTime(curve, now + 0.005, seconds);
  }

  async begin(section, url, fadeIn) {
    const ticket = ++this.ticket;
    clearTimeout(this.stopTimer);
    this.section = section;
    this.busy = true;
    this.ending = false;
    this.wantsPlay = true;
    this.fadeTo(0, 0);
    const { audio } = this;
    if (this.url !== url) {
      this.url = url;
      audio.src = url;
    }
    // Yarıda kesilen önceki yükleme aynı dosyadaysa üst veri hâlâ yolda olabilir.
    if (audio.readyState < 1) {
      await once(audio, 'loadedmetadata');
      if (ticket !== this.ticket) return;
    }
    audio.currentTime = section.from;
    await once(audio, 'seeked');
    if (ticket !== this.ticket) return;
    this.fadeTo(section.track.gain, fadeIn);
    this.play();
  }

  play() {
    if (!this.wantsPlay || document.hidden) return;
    this.audio.play()?.catch?.(() => this.owner.waitForGesture());
  }

  release(seconds) {
    this.ending = true;
    this.wantsPlay = false;
    const ticket = ++this.ticket;
    this.fadeTo(0, seconds);
    clearTimeout(this.stopTimer);
    this.stopTimer = setTimeout(() => {
      if (ticket !== this.ticket) return;
      this.audio.pause();
      this.busy = false;
      this.section = null;
    }, seconds * 1000 + 120);
  }
}

function once(target, type) {
  return new Promise((resolve) => {
    const done = () => {
      target.removeEventListener(type, done);
      target.removeEventListener('error', done);
      resolve();
    };
    target.addEventListener(type, done);
    target.addEventListener('error', done);
  });
}

const between = ([min, max]) => min + Math.random() * (max - min);

/** Müzik seçicinin sırası: kayıtların kendisi, baştan sona. */
export const PLAYLIST = Object.values(TRACKS);
const MODE_KEY = 'hexwar:music-mode';
const TRACK_KEY = 'hexwar:music-track';
/** Oyuncunun seçtiği parça bitince sıradakine geçmeden önceki nefes (sn). */
const PLAYLIST_GAP = 4;
const wholeTrack = (track) => ({ id: `track:${track.id}`, track, from: 0, to: track.duration - 0.3, tail: 3 });

function readPref(key, fallback) {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

function writePref(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Depolama kapalı: tercih oturumla sınırlı kalır.
  }
}

export class Soundtrack {
  constructor(game, menu) {
    this.game = game;
    this.menu = menu;
    this.library = new Library();
    this.ctx = null;
    this.master = null;
    this.decks = [];
    this.current = null;
    this.active = false;
    this.ended = false;
    this.mood = null;
    this.wantMood = null;
    this.wantSince = 0;
    this.moment = null;
    this.momentAt = {};
    this.cursor = {};
    this.outbreaks = 0;
    this.lastSection = null;
    this.edges = null;
    this.lastRead = 0;
    this.run = 0;
    this.gapTimer = 0;
    this.soonTimer = 0;
    // Müzik seçici (ui/musicPicker.js): 'auto' = yönetmen seçer, 'track' =
    // oyuncunun parçası ve ardından sıradakiler, 'off' = sessiz.
    this.mode = readPref(MODE_KEY, 'auto');
    if (!['auto', 'track', 'off'].includes(this.mode)) this.mode = 'auto';
    this.choice = TRACKS[readPref(TRACK_KEY, '')] ? readPref(TRACK_KEY, '') : PLAYLIST[0].id;
    this.listeners = new Set();

    // Menü kapanınca müzik gelir, açılınca menünün kendi müziğine yer açar.
    new MutationObserver(() => this.syncMenu()).observe(document.body, { attributes: true, attributeFilter: ['class'] });
    game.on('turn', () => this.evaluate());
    game.on('battles', () => this.soon());
    game.on('diplomacy', () => this.soon());
    // Durmuş saatte verilen ilan haftayı beklemesin.
    game.on('notify', ({ entry, repeated } = {}) => {
      if (!repeated && ['WAR', 'CRISIS', 'PEACE', 'CONQUEST'].includes(entry?.kind)) this.soon();
    });
    game.on('victory', (result) => this.onVictory(result));
    onPeace((_game, event) => this.onPeace(event));
    document.addEventListener('visibilitychange', () => this.syncVisibility());
    setInterval(() => this.active && this.tick(), TICK_MS);
    this.mountSettings();
    this.syncMenu();
  }

  get player() {
    return this.game.world?.nations?.[this.game.turns?.playerNation] ?? null;
  }

  /** settingsPanel `game.music.deck?.apply()` çağırır. */
  get deck() {
    return this.current;
  }

  /** Ayar menü müziğiyle ortak (hexwar:menu-volume / hexwar:menu-muted). */
  outputLevel() {
    const m = this.menu?.music;
    return !m || m.muted ? 0 : m.level;
  }

  applyLevel() {
    if (!this.master) return;
    this.sentLevel = this.outputLevel();
    this.master.gain.setTargetAtTime(this.sentLevel, this.ctx.currentTime, 0.03);
  }

  ensureAudio() {
    if (this.ctx) return;
    this.ctx = new AudioContext();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.outputLevel();
    this.master.connect(this.ctx.destination);
    for (let i = 0; i < DECK_COUNT; i++) this.decks.push(new Deck(this.ctx, this.master, this));
    if (this.ctx.state !== 'running') this.waitForGesture();
  }

  /** Tarayıcı dokunuştan önce sesi engeller (?seed= ile doğrudan açılış). */
  waitForGesture() {
    if (this.waiting) return;
    this.waiting = true;
    const retry = () => {
      this.waiting = false;
      document.removeEventListener('pointerdown', retry);
      document.removeEventListener('keydown', retry);
      this.ctx?.resume();
      if (this.active) this.current?.play();
    };
    document.addEventListener('pointerdown', retry);
    document.addEventListener('keydown', retry);
  }

  syncVisibility() {
    if (!this.ctx) return;
    if (document.hidden) {
      for (const deck of this.decks) deck.audio.pause();
      this.ctx.suspend();
    } else if (this.active) {
      this.ctx.resume();
      for (const deck of this.decks) deck.play();
    }
  }

  syncMenu() {
    const inMenu = document.body.classList.contains('menu-open');
    if (inMenu && this.active) {
      this.active = false;
      this.run++;
      clearTimeout(this.gapTimer);
      clearTimeout(this.soonTimer);
      this.current?.release(FADES.open.out);
      this.current = null;
      this.mood = null;
      this.wantMood = null;
      this.moment = null;
    } else if (!inMenu && !this.active && this.player) {
      this.active = true;
      this.ensureAudio();
      this.ctx.resume();
      this.applyLevel();
      // Savaş anında gecikmesin diye üç kayıt da baştan hazırlanır.
      for (const track of Object.values(TRACKS)) this.library.url(track);
      this.ended = Boolean(this.game.turns?.victory);
      this.edges = null;
      if (this.mode === 'track') this.playChoice(FADES.open);
      this.evaluate(true);
    }
    this.notify();
  }

  // ---- müzik seçici ------------------------------------------------------

  /** Seçici değişikliği dinler (çalan parça, kip). */
  onChange(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  notify() {
    for (const fn of this.listeners) fn(this.describe());
  }

  /** Yönetmene bırak: hâlin bölümü yumuşak geçişle gelir. */
  setAuto() {
    this.setMode('auto');
    if (!this.active) return;
    this.mood = null;
    this.moment = null;
    this.run++;
    this.current?.release(FADES.calm.out);
    this.current = null;
    this.evaluate(true);
  }

  /** Oyuncunun parçası: baştan çalar, bitince listede sıradakine geçer. */
  playTrack(id) {
    if (!TRACKS[id]) return;
    this.choice = id;
    writePref(TRACK_KEY, id);
    this.setMode('track');
    this.playChoice(FADES.rise);
  }

  /** Önceki/sonraki: elle seçim kipine geçirir. */
  step(dir) {
    const at = PLAYLIST.findIndex((t) => t.id === (this.mode === 'track' ? this.choice : this.current?.section?.track.id ?? this.choice));
    const next = PLAYLIST[(Math.max(0, at) + dir + PLAYLIST.length) % PLAYLIST.length];
    this.playTrack(next.id);
  }

  stop() {
    this.setMode('off');
    this.run++;
    clearTimeout(this.gapTimer);
    this.moment = null;
    this.current?.release(FADES.calm.out / 2);
    this.current = null;
    this.notify();
  }

  setMode(mode) {
    this.mode = mode;
    writePref(MODE_KEY, mode);
    this.notify();
  }

  playChoice(fade) {
    if (!this.active) return;
    this.moment = null;
    this.playSection(wholeTrack(TRACKS[this.choice]), fade);
  }

  /** Olay sonrası kısa gecikmeyle bir kez değerlendir (hafta dilimlenirken çok kez gelir). */
  soon() {
    clearTimeout(this.soonTimer);
    this.soonTimer = setTimeout(() => this.evaluate(true), 400);
  }

  evaluate(force = false) {
    if (!this.active) return;
    // Haftalık kapanış karelere dilimlenir; yarım hâli okumayalım.
    if (this.game.turns?.turnJob) return this.soon();
    const now = performance.now();
    if (!force && now - this.lastRead < READ_EVERY_MS) return;
    this.lastRead = now;
    const { world, turns } = this.game;
    const state = readMusicState(world, turns?.playerNation, turns?.turn ?? 0, this.wantMood);
    if (!state) return;
    this.noticeEdges(world, state);
    const mood = this.ended ? 'epilogue' : state.mood;
    if (mood !== this.wantMood) {
      this.wantMood = mood;
      this.wantSince = now;
    }
    this.settle(force && this.mood === null);
  }

  /** Bir önceki okumadan bu yana olan olaylar; kayıt yüklenince sayaç sıfırlanır. */
  noticeEdges(world, state) {
    const before = this.edges;
    this.edges = { world, ...state };
    if (!before || before.world !== world || this.ended) return;
    if (state.capitalOccupied && !before.capitalOccupied) this.playMoment('capitalFall');
    else if (!state.capitalOccupied && before.capitalOccupied) this.playMoment('capitalTaken');
    else if (state.capitalsHeld > before.capitalsHeld) this.playMoment('capitalTaken');
    const fresh = state.fired.some((id) => !before.fired.includes(id));
    if (fresh && !isWarMood(this.mood)) this.playMoment('worldShock');
  }

  settle(force = false) {
    // Oyuncu parçasını seçtiyse ya da kapattıysa yönetmen yalnız okur.
    if (this.mode !== 'auto') return;
    const want = this.wantMood;
    if (!want || want === this.mood) return;
    const outbreak = isWarMood(want) && !isWarMood(this.mood);
    // Vurgu sürerken yatak değişmez; biterken istenen hâle dönülür. Savaşın
    // patlaması ise başkent düşüşü dışında her vurgunun önüne geçer.
    if (this.moment && !(outbreak && MOMENTS[this.moment].priority < 4)) return;
    if (!force && this.mood !== null) {
      const rising = MOODS[want].rank > MOODS[this.mood].rank;
      const dwell = performance.now() - this.wantSince;
      if (!rising && dwell < (isWarMood(want) && isWarMood(this.mood) ? TURN_MS : SETTLE_MS)) return;
    }
    this.enterMood(want);
  }

  enterMood(mood) {
    const previous = this.mood;
    this.mood = mood;
    this.moment = null;
    if (isWarMood(mood) && !isWarMood(previous)) {
      this.playSection(SECTIONS[OUTBREAKS[this.outbreaks++ % OUTBREAKS.length]], FADES.hit);
      return;
    }
    let fade = FADES.calm;
    if (previous === null) fade = FADES.open;
    else if (isWarMood(mood) && isWarMood(previous)) fade = FADES.turn;
    else if (MOODS[mood].rank > MOODS[previous].rank) fade = FADES.rise;
    this.playSection(this.pick(mood), fade);
  }

  /** Listeyi sırayla döner; aynı bölüm art arda iki kez çalmaz. */
  pick(mood) {
    const { list } = MOODS[mood];
    let index = this.cursor[mood] ?? 0;
    if (list[index % list.length] === this.lastSection?.id) index++;
    this.cursor[mood] = index + 1;
    return SECTIONS[list[index % list.length]];
  }

  freeDeck() {
    return this.decks.find((deck) => !deck.busy)
      ?? this.decks.find((deck) => deck.ending)
      ?? this.decks.find((deck) => deck !== this.current);
  }

  async playSection(section, fade) {
    const run = ++this.run;
    clearTimeout(this.gapTimer);
    const url = await this.library.url(section.track);
    if (run !== this.run || !this.active) return;
    if (!url) {
      this.scheduleNext(MISSING_RETRY_S);
      return;
    }
    const previous = this.current;
    const deck = this.freeDeck();
    previous?.release(fade.out);
    this.current = deck;
    this.lastSection = section;
    deck.begin(section, url, fade.in);
    this.notify();
  }

  scheduleNext(seconds) {
    clearTimeout(this.gapTimer);
    this.gapTimer = setTimeout(() => this.next(), seconds * 1000);
  }

  /** Bölüm ya da vurgu bitti: istenen hâlin sıradaki bölümüne geç. */
  next() {
    if (!this.active || this.mode === 'off') return;
    if (this.mode === 'track') {
      const at = PLAYLIST.findIndex((t) => t.id === this.choice);
      this.choice = PLAYLIST[(at + 1) % PLAYLIST.length].id;
      writePref(TRACK_KEY, this.choice);
      this.playChoice(FADES.resume);
      return;
    }
    this.moment = null;
    this.mood = this.wantMood ?? this.mood ?? 'peace';
    this.playSection(this.pick(this.mood), FADES.resume);
  }

  sectionEnding(deck) {
    if (deck !== this.current || deck.ending || !deck.section) return;
    const { tail } = deck.section;
    deck.release(tail);
    this.current = null;
    let gap = this.moment ? 0.4 : between(MOODS[this.mood ?? 'peace'].gap);
    if (this.mode === 'track') gap = PLAYLIST_GAP;
    this.scheduleNext(tail + gap);
    this.notify();
  }

  tick() {
    // Parçalar arası sessizlikte deste yoktur; ayar değişikliği yine de işlensin.
    if (this.outputLevel() !== this.sentLevel) this.applyLevel();
    const deck = this.current;
    if (deck?.section && !deck.ending && deck.audio.currentTime >= deck.section.to - deck.section.tail) {
      this.sectionEnding(deck);
    }
    this.settle();
  }

  playMoment(id) {
    const def = MOMENTS[id];
    if (!this.active || !def || this.mode !== 'auto') return;
    const active = this.moment ? MOMENTS[this.moment] : null;
    if (active && active.priority >= def.priority) return;
    const now = performance.now();
    if (now - (this.momentAt[id] ?? -Infinity) < def.cooldown * 1000) return;
    this.momentAt[id] = now;
    this.moment = id;
    this.playSection(SECTIONS[def.section], FADES[def.fade]);
  }

  onPeace({ a, b, loser, white } = {}) {
    const id = this.game.turns?.playerNation;
    if (a !== id && b !== id) return;
    if (white || loser === null || loser === undefined) this.playMoment('peaceWhite');
    else this.playMoment(loser === id ? 'peaceLost' : 'peaceWon');
  }

  onVictory(result) {
    this.ended = true;
    this.wantMood = 'epilogue';
    this.mood = 'epilogue';
    this.playMoment(result?.nation?.id === this.game.turns?.playerNation ? 'campaignWon' : 'campaignLost');
  }

  /** Denetim ve konsol için: şu an ne çalıyor. */
  describe() {
    const deck = this.current;
    return {
      mode: this.mode,
      choice: this.choice,
      active: this.active,
      mood: this.mood,
      want: this.wantMood,
      moment: this.moment,
      section: deck?.section?.id ?? null,
      track: deck?.section?.track.id ?? null,
      at: deck ? deck.audio.currentTime : null,
      level: this.outputLevel(),
      context: this.ctx?.state ?? null,
    };
  }

  /** Oyun içi ayar paneline "Music" çubuğu: menüdeki müzik ayarıyla aynı değer. */
  mountSettings() {
    const panel = document.getElementById('settings');
    const anchor = document.getElementById('save-info');
    if (!panel || !anchor || document.getElementById('in-music')) return;
    const row = document.createElement('label');
    row.className = 'field';
    row.innerHTML = '<span>Music: <b id="lbl-music"></b></span><input type="range" id="in-music" min="0" max="100" step="1" />';
    panel.insertBefore(row, anchor);
    const input = row.querySelector('input');
    const label = row.querySelector('b');
    const paint = () => {
      const m = this.menu?.music;
      const level = m ? Math.round(m.level * 100) : 42;
      input.value = m?.muted ? 0 : level;
      label.textContent = m?.muted ? 'off' : `${level}%`;
    };
    input.addEventListener('input', () => {
      this.menu?.music?.setVolume(Number(input.value) / 100);
      this.applyLevel();
      paint();
    });
    paint();
    // Menüdeki çubuk değişirse oyun müziği de izlesin.
    document.getElementById('menu-volume')?.addEventListener('input', () => { this.applyLevel(); paint(); });
    document.getElementById('menu-mute')?.addEventListener('click', () => setTimeout(() => { this.applyLevel(); paint(); }));
  }
}
