// RAFTA (2026-11-18): oyuna bağlı değil, oyun müziği ui/soundtrack.js'tedir.
//
// Oyun müziği yönetmeni: oyunun hâline göre hangi parçanın, hangi düzeyde
// çalacağını seçer (bkz. src/audio/*: savaş, barış/gerilim, seferberlik, devlet,
// deniz, kargaşa + olay müzikleri).
//
// Öncelik (yüksek olan anında devralır, alçak olan ~8 sn ısrar ederse geçer —
// ekran açıp kapamak müziği sağa sola savurmasın):
//   savaş        savaştayken kara muharebesi sürüyor        düzey: muharebe sayısı + yorgunluk
//   deniz        savaşta, bu hafta deniz muharebesi var
//   seferberlik  savaş (muharebesiz) / ültimatom / seferberlik
//   kargaşa      barışta bir halk hareketi yarıyı geçti ya da krizde
//   devlet       barışta diplomasi/ekonomi ekranı açık
//   deniz        barışta "Seas" harita kipi
//   barış        barış; gerilim = komşunun saldırabilirliği + yorgunluk
//
// Bütün parçalar TEK ses bağlamını ve tek tampon kümesini paylaşır (bkz.
// orchestra.js bellek notu); bağlam 32 kHz: kabin ve süzgeçlerden sonra 16 kHz
// üstünde iş yok, bellek ~%27 azalır.
//
// Katman notu: ui katmanı — oyun durumunu okur, oyuna yazmaz.

import { CuePlayer, MusicPlayer, clamp01 } from '../audio/musicEngine.js';
import { BattleScore } from '../audio/battleMusic.js';
import { PeaceScore } from '../audio/peaceMusic.js';
import { MarchScore } from '../audio/marchMusic.js';
import { StateScore } from '../audio/stateMusic.js';
import { NavalScore } from '../audio/navalMusic.js';
import { UnrestScore } from '../audio/unrestMusic.js';
import { Cues } from '../audio/cues.js';
import { atWar, inCrisis, hostileNations } from '../game/diplomacy.js';
import { battlesFor } from '../game/battles.js';
import { navyState } from '../game/navy.js';
import { isMobilized } from '../game/mobilization.js';
import { onPeace } from '../game/peace.js';
import { threatView } from '../game/pacts.js';
import { borderNationIds } from '../game/command.js';

const PIECES = {
  savas: { Score: BattleScore, rank: 5 },
  deniz: { Score: NavalScore, rank: 4 },
  sefer: { Score: MarchScore, rank: 3 },
  kargasa: { Score: UnrestScore, rank: 2 },
  devlet: { Score: StateScore, rank: 1 },
  baris: { Score: PeaceScore, rank: 0 },
};
// Devlet müziği bu ekranlarda (diplomasi ve ekonomi masası).
const STATE_SCREENS = new Set(['diplomacy', 'dossier', 'budget', 'industry', 'trade', 'construction', 'population', 'politics', 'cultures', 'technology', 'nation']);
const SETTLE_MS = 8000;
const FADE = 2.5;
// Menü müziği HTMLAudio düzeyi (varsayılan 0.42) bu çarpanla oyun müziğine
// taşınır: iki kaynak aynı ayar çubuğunda kabaca eşit duyulsun.
const LEVEL_TO_GAIN = 1.8;

export class GameMusic {
  constructor(game, screens, menu) {
    this.game = game;
    this.screens = screens;
    this.menu = menu;
    this.ctx = null;
    this.master = null;
    this.players = new Map();
    this.cues = null;
    this.current = null;
    this.want = null;
    this.wantSince = 0;
    this.threat = { turn: -1, value: 0 };
    this.active = false;

    // Menü kapanınca (kampanya başlar / sürer) müzik gelir, açılınca susar.
    new MutationObserver(() => this.syncMenu()).observe(document.body, { attributes: true, attributeFilter: ['class'] });
    game.on('turn', () => this.evaluate());
    game.on('mapmode', () => this.evaluate());
    game.on('battles', () => this.soon());
    game.on('diplomacy', () => this.soon());
    game.on('notify', ({ entry, repeated } = {}) => {
      if (!repeated && entry?.kind === 'WAR') this.cue('savasIlani');
    });
    game.on('victory', () => this.cue('zafer'));
    onPeace((ev) => this.onPeace(ev));
    document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return;
      if (document.hidden) this.ctx.suspend();
      else if (this.active) this.ctx.resume();
    });
    // Ekran açılıp kapanması oyun olayı değil; ertelenmiş geçişi zamanlayıcı yürütür.
    setInterval(() => this.active && this.tick(), 1000);
    this.mountSettings();
    this.syncMenu();
  }

  get player() {
    return this.game.world?.nations?.[this.game.turns?.playerNation] ?? null;
  }

  // ---------------------------------------------------------------- ses

  ensureContext() {
    if (this.ctx) return;
    this.ctx = new AudioContext({ latencyHint: 'playback', sampleRate: 32000 });
    this.master = this.ctx.createGain();
    this.master.connect(this.ctx.destination);
    this.applyVolume();
    this.cues = new CuePlayer(Cues, { ctx: this.ctx, dest: this.master, volume: 1 });
  }

  /** Ayar menü müziğiyle ortak (hexwar:menu-volume / hexwar:menu-muted). */
  applyVolume() {
    const m = this.menu?.music;
    const level = !m || m.muted ? 0 : m.level;
    if (this.master) this.master.gain.setTargetAtTime(level * LEVEL_TO_GAIN, this.ctx.currentTime, 0.1);
  }

  playerFor(key) {
    let p = this.players.get(key);
    if (!p) {
      p = new MusicPlayer(PIECES[key].Score, { ctx: this.ctx, dest: this.master, volume: 1 });
      p.attachInput(window);
      this.players.set(key, p);
    }
    return p;
  }

  syncMenu() {
    const inMenu = document.body.classList.contains('menu-open');
    if (inMenu && this.active) {
      this.active = false;
      for (const p of this.players.values()) p.stop(FADE);
      this.current = null;
    } else if (!inMenu && !this.active && this.player) {
      this.active = true;
      this.ensureContext();
      this.ctx.resume();
      this.evaluate(true);
    }
  }

  // ---------------------------------------------------------------- seçim

  /** Oyunun hâlinden istenen parça ve düzey. */
  desired() {
    const { world } = this.game;
    const me = this.player;
    if (!world || !me) return null;
    const turn = world.turn ?? 0;
    const exhaustion = me.politics?.exhaustion ?? 0;
    const enemies = hostileNations(world, me.id);
    const wars = enemies.filter((o) => atWar(world, me.id, o.id));
    const crisis = enemies.some((o) => inCrisis(world, me.id, o.id));

    if (wars.length) {
      const battles = battlesFor(world, me.id).filter((b) => !b.result).length;
      if (battles) return { key: 'savas', level: clamp01(0.5 + 0.12 * battles + 0.25 * exhaustion) };
      if (this.navalBattleThisWeek(me.id, turn)) return { key: 'deniz', level: 0.85 };
      return { key: 'sefer', level: clamp01(0.65 + 0.1 * wars.length) };
    }
    if (crisis) return { key: 'sefer', level: 0.55 };
    if (isMobilized(me)) {
      const m = me.mobilization;
      return { key: 'sefer', level: clamp01(0.35 + 0.35 * ((m.raised ?? 0) / Math.max(1, m.target ?? 1))) };
    }

    const movements = Object.values(me.movements ?? {});
    const unrest = Math.max(0, ...movements.map((s) => (s.progress ?? 0) / 100));
    const inCrisisMove = movements.some((s) => s.crisis);
    if (unrest >= 0.5 || inCrisisMove) return { key: 'kargasa', level: clamp01(Math.max(unrest, inCrisisMove ? 0.7 : 0)) };

    if (STATE_SCREENS.has(this.screens?.active)) return { key: 'devlet', level: clamp01(me.stability ?? 0.5) };
    if (this.game.renderer?.mapMode === 'seas') return { key: 'deniz', level: 0.15 };
    return { key: 'baris', level: clamp01(this.threatLevel(me, turn) + 0.5 * exhaustion) };
  }

  navalBattleThisWeek(id, turn) {
    const reports = navyState(this.game.world)?.reports ?? [];
    return reports.some((r) => r.turn >= turn - 1 && r.sides?.some((s) => s.nations?.includes(id)));
  }

  /** Komşulardan en tehlikelisi; haftada bir hesaplanır (threatView bütün birlikleri tarar). */
  threatLevel(me, turn) {
    if (this.threat.turn === turn) return this.threat.value;
    let value = 0;
    for (const id of borderNationIds(this.game.world, me.id)) {
      const v = threatView(this.game.world, this.game.world.nations[id], me, turn);
      if (!v) continue;
      value = Math.max(value, v.label === 'may attack' ? 0.6 : v.label === 'able, not ready' ? 0.3 : 0);
    }
    this.threat = { turn, value };
    return value;
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
    const d = this.desired();
    if (!d) return;
    if (this.want?.key !== d.key) this.wantSince = performance.now();
    this.want = d;
    this.tick(force);
  }

  tick(force = false) {
    // Ekran açılıp kapandığında devlet/barış arası geçiş ertelenmiş seçimi tazeler.
    const screenKey = STATE_SCREENS.has(this.screens?.active);
    if (this.want && (this.want.key === 'devlet') !== screenKey && (this.want.key === 'devlet' || this.want.key === 'baris')) {
      return this.evaluate();
    }
    const d = this.want;
    if (!d) return;
    const cur = this.current;
    if (cur?.key === d.key) {
      cur.player.setLevel(d.level);
      return;
    }
    const rises = !cur || PIECES[d.key].rank > PIECES[cur.key].rank;
    if (!force && !rises && performance.now() - this.wantSince < SETTLE_MS) return;
    this.switchTo(d);
  }

  async switchTo({ key, level }) {
    const prev = this.current;
    const player = this.playerFor(key);
    this.current = { key, player };
    prev?.player.stop(FADE);
    player.setLevel(level);
    player.level = level;
    await player.start();
    if (this.current?.player !== player) return;
    // Yeni parça sessizden açılır: iki parça bir an üst üste, sert kesme yok.
    const g = player.score.master.gain;
    const now = this.ctx.currentTime;
    g.cancelScheduledValues(now);
    g.setValueAtTime(0.0001, now);
    g.linearRampToValueAtTime(1, now + FADE);
  }

  // ---------------------------------------------------------------- olaylar

  onPeace({ a, b, loser, white } = {}) {
    const id = this.game.turns?.playerNation;
    if (a !== id && b !== id) return;
    if (white) return;
    this.cue(loser === id ? 'yenilgi' : 'zafer');
  }

  cue(name) {
    if (!this.active || !this.cues) return;
    this.cues.play(name);
  }

  // ---------------------------------------------------------------- ayar

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
      this.applyVolume();
      paint();
    });
    paint();
    // Menüdeki çubuk değişirse oyun müziği de izlesin.
    document.getElementById('menu-volume')?.addEventListener('input', () => { this.applyVolume(); paint(); });
    document.getElementById('menu-mute')?.addEventListener('click', () => setTimeout(() => { this.applyVolume(); paint(); }));
  }
}
