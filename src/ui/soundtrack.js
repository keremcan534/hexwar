// Oyun içi müzik: üç kayıttan hangisinin çalacağını oyunun hâli seçer.
//
//   savaş ilanı (ültimatom) ve savaş   Vanguard
//   barış          The Climb ve Age of Wonder sırayla, aralarında sessizlik
//   kazanılan barış ya da zafer   The Climb baştan, sonuna dek
//
// Neden böyle kuruldu:
// - Audio elemanı dosyayı akıtır: beş-altı dakikalık kayıtlar Web Audio
//   tamponuna çözülseler parça başına ~100 MB bellek tutardı.
// - Savaş anında gelir; barışa dönüş birkaç saniye oturunca olur. Haftanın
//   kapanışında durum bir an gidip geldiğinde müzik savrulmasın.
// - Parça aralarındaki sessizlik kasıtlı: aynı üç kayıt saatlerce döner, ara
//   vermeden çalınca kısa sürede bıktırır.
//
// Katman notu: ui katmanı; oyun durumunu okur, oyuna yazmaz.

import { atWar, hostileNations, inCrisis } from '../game/diplomacy.js';
import { onPeace } from '../game/peace.js';
import { TRACKS } from './musicTracks.js';

const FADE_MS = 2500;
const FADE_STEP_MS = 50;
const SETTLE_MS = 8000;
const GAP_MS = { war: 6000, peace: 25000 };

/** Tek kaydın çalımı: geçişte iki deste bir an üst üste duyulur, sert kesme olmaz. */
class Deck {
  constructor(track, level, onEnd) {
    this.track = track;
    this.level = level;
    this.fade = 0;
    this.timer = 0;
    this.stopped = false;
    this.audio = new Audio(track.src);
    this.audio.preload = 'auto';
    this.audio.volume = 0;
    this.audio.addEventListener('ended', onEnd);
    // Dosya bulunamazsa oyun sürer: sıradaki deneme aradaki sessizlikten sonra.
    this.audio.addEventListener('error', () => { if (!this.stopped) onEnd(); });
  }

  apply() {
    this.audio.volume = Math.max(0, Math.min(1, this.level() * this.track.gain * this.fade));
  }

  play() {
    this.audio.play()?.catch?.(() => {
      // Tarayıcı dokunuştan önce sesi engeller (?seed= ile doğrudan açılış).
      if (this.stopped) return;
      const retry = () => { if (!this.stopped) this.audio.play().catch(() => {}); };
      document.addEventListener('pointerdown', retry, { once: true });
      document.addEventListener('keydown', retry, { once: true });
    });
  }

  fadeTo(target, done) {
    clearInterval(this.timer);
    const from = this.fade;
    const steps = Math.max(1, Math.round(FADE_MS / FADE_STEP_MS));
    let step = 0;
    this.timer = setInterval(() => {
      step++;
      this.fade = from + (target - from) * Math.min(1, step / steps);
      this.apply();
      if (step >= steps) {
        clearInterval(this.timer);
        done?.();
      }
    }, FADE_STEP_MS);
  }

  stop() {
    this.stopped = true;
    this.fadeTo(0, () => {
      this.audio.pause();
      this.audio.removeAttribute('src');
      this.audio.load();
    });
  }
}

export class Soundtrack {
  constructor(game, menu) {
    this.game = game;
    this.menu = menu;
    this.active = false;
    this.deck = null;
    this.mood = null;
    this.wantMood = null;
    this.wantSince = 0;
    this.moment = false;
    this.gapTimer = 0;
    // Menü Age of Wonder ile kapanır: oyun aynı parçayla açılmasın.
    this.lastPeace = TRACKS.ageOfWonder;

    // Menü kapanınca müzik gelir, açılınca menünün kendi müziğine yer açar.
    new MutationObserver(() => this.syncMenu()).observe(document.body, { attributes: true, attributeFilter: ['class'] });
    game.on('turn', () => this.evaluate());
    game.on('battles', () => this.soon());
    game.on('diplomacy', () => this.soon());
    game.on('notify', ({ entry, repeated } = {}) => {
      if (!repeated && entry?.kind === 'WAR') this.soon();
    });
    game.on('victory', () => this.playMoment());
    onPeace((ev) => this.onPeace(ev));
    document.addEventListener('visibilitychange', () => {
      if (!this.deck) return;
      if (document.hidden) this.deck.audio.pause();
      else if (this.active) this.deck.play();
    });
    setInterval(() => this.active && this.tick(), 1000);
    this.mountSettings();
    this.syncMenu();
  }

  get player() {
    return this.game.world?.nations?.[this.game.turns?.playerNation] ?? null;
  }

  /** Ayar menü müziğiyle ortak (hexwar:menu-volume / hexwar:menu-muted). */
  outputLevel() {
    const m = this.menu?.music;
    return !m || m.muted ? 0 : m.level;
  }

  syncMenu() {
    const inMenu = document.body.classList.contains('menu-open');
    if (inMenu && this.active) {
      this.active = false;
      clearTimeout(this.gapTimer);
      this.deck?.stop();
      this.deck = null;
      this.mood = null;
      this.wantMood = null;
      this.moment = false;
    } else if (!inMenu && !this.active && this.player) {
      this.active = true;
      this.evaluate(true);
    }
  }

  readMood() {
    const { world } = this.game;
    const me = this.player;
    if (!world || !me) return null;
    // İlan savaşı hemen başlatmaz, ültimatom haftaları açar: müzik ilanla gelir.
    const tense = hostileNations(world, me.id).some((o) => atWar(world, me.id, o.id) || inCrisis(world, me.id, o.id));
    return tense ? 'war' : 'peace';
  }

  /** Olay sonrası kısa gecikmeyle bir kez değerlendir (hafta dilimlenirken çok kez gelir). */
  soon() {
    clearTimeout(this.soonTimer);
    this.soonTimer = setTimeout(() => this.evaluate(), 400);
  }

  evaluate(force = false) {
    if (!this.active) return;
    // Haftalık kapanış karelere dilimlenir; yarım hâli okumayalım.
    if (this.game.turns?.turnJob) return this.soon();
    const mood = this.readMood();
    if (!mood) return;
    if (mood !== this.wantMood) {
      this.wantMood = mood;
      this.wantSince = performance.now();
    }
    this.tick(force);
  }

  tick(force = false) {
    const want = this.wantMood;
    if (!want || want === this.mood) return;
    if (want === 'peace') {
      if (!force && performance.now() - this.wantSince < SETTLE_MS) return;
      // Kazanılan barışın parçası yarıda kesilmez; bitince barış sırası gelir.
      if (this.moment) {
        this.mood = 'peace';
        return;
      }
    }
    this.enter(want);
  }

  enter(mood) {
    clearTimeout(this.gapTimer);
    this.mood = mood;
    this.moment = false;
    this.switchTo(mood === 'war' ? TRACKS.vanguard : this.nextPeaceTrack());
  }

  nextPeaceTrack() {
    this.lastPeace = this.lastPeace === TRACKS.theClimb ? TRACKS.ageOfWonder : TRACKS.theClimb;
    return this.lastPeace;
  }

  switchTo(track) {
    this.deck?.stop();
    const deck = new Deck(track, () => this.outputLevel(), () => this.onEnded(deck));
    this.deck = deck;
    deck.fadeTo(1);
    if (!document.hidden) deck.play();
  }

  onEnded(deck) {
    if (deck !== this.deck) return;
    this.deck = null;
    if (this.moment) {
      this.moment = false;
      this.mood = null;
      this.evaluate(true);
      return;
    }
    const mood = this.mood;
    this.gapTimer = setTimeout(() => {
      if (this.active && this.mood === mood && !this.deck) this.enter(mood);
    }, GAP_MS[mood] ?? GAP_MS.peace);
  }

  onPeace({ a, b, loser, white } = {}) {
    const id = this.game.turns?.playerNation;
    if ((a !== id && b !== id) || white || loser === id) return;
    this.playMoment();
  }

  playMoment() {
    if (!this.active) return;
    clearTimeout(this.gapTimer);
    this.moment = true;
    this.lastPeace = TRACKS.theClimb;
    if (this.deck?.track !== TRACKS.theClimb) this.switchTo(TRACKS.theClimb);
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
      this.deck?.apply();
      paint();
    });
    paint();
    // Menüdeki çubuk değişirse oyun müziği de izlesin.
    document.getElementById('menu-volume')?.addEventListener('input', () => { this.deck?.apply(); paint(); });
    document.getElementById('menu-mute')?.addEventListener('click', () => setTimeout(() => { this.deck?.apply(); paint(); }));
  }
}
