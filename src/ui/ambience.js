// Harita ambiyansı: rüzgâr, kıyıda deniz, karada uzak kuşlar, savaşta uzak
// cephe (top gümbürtüsü + seyrek tüfek). Ses ui/soundscape.js'te SENTEZLENİR;
// bu dosya yalnız oyunun hâlinden hedef düzeyleri okur.
//
// Neden böyle kuruldu:
// - Eski beş kayıt (assets/audio/ambience/, YouTube, lisansı belirsiz, depoda
//   yok) kulağı yoruyordu: kısa döngü, savaş boyunca kameradan bağımsız
//   "yağmur + topçu", ani giriş. Artık dosya okunmaz; o klasör kullanılmıyor.
// - Sürekli rAF YOK. Hedefler oyun olaylarında (hafta, harita kipi, muharebe,
//   kare = kamera) saniyede en çok dört kez hesaplanır; geçişleri
//   AudioParam.setTargetAtTime yürütür. Olaylar (esinti, dalga, top) yarım
//   saniyelik zamanlayıcıyla ses saatine ileriye yazılır, yalnız ses açıkken.
// - Savaş sesi oyuncunun kendi muharebelerinden gelir; kameranın uzaklığı ve
//   kulak menzilindeki muharebe sayısı belirler. Muharebe verisi yalnız
//   okunur (world.battleSystem); oyunun zarı kullanılmaz.
// - Tarayıcı kullanıcı dokunmadan sesi engeller: bağlam ilk dokunuş/tuşta
//   kurulur, önce kurulursa konsola uyarı düşer.
// - Ana menüde ve kampanya başlamadan ambiyans yok: menünün müziği var.
//
// Katman notu: ui katmanıdır; oyun durumunu OKUR, oyuna yazmaz. Oyun bu
// dosyayı bilmez (game.ambience yalnız konsol denetimi için bağlanır).

import { atWar } from '../game/diplomacy.js';
import { pixelToHex } from '../core/hex.js';
import { HEX_SIZE } from '../world/worldgen.js';
import { Soundscape } from './soundscape.js';

const VOLUME_KEY = 'hexwar:ambience-volume';
const MUTE_KEY = 'hexwar:ambience-muted';
const DEFAULT_VOLUME = 60;
/** Karışımdaki yeri (ölçüm: scripts/ui/ambience-levels.plan.mjs). */
const MIX_TRIM = 0.5;

/** Hedef hesabı en sık bu aralıkla: kamera kaydırması kare başına tetikler. */
const UPDATE_MS = 250;
/** Olay yazıcısı bu aralıkla uyanır ve bu kadar ileriyi yazar. */
const PUMP_MS = 500;
const LOOKAHEAD_S = 1.5;
/** Sessizlikten sese ana kazanç yavaş gelir: açılışta sıçrama yok. */
const MASTER_TAU = 1.2;
/** Ekran/duraklatma kısması daha çabuk oturmalı: oyuncu tıkladığını duysun. */
const DUCK_TAU = 0.35;
/** Yönetim ekranı açıkken: −8 dB. */
const SCREEN_DUCK = 0.4;
/** Duraklatılmış oyun: dünya yaşıyor hissi kalsın, ama geri çekilsin. */
const PAUSE_DUCK = 0.65;
/** Deniz muharebesinin sesi bu kadar haftada söner. */
const NAVAL_WEEKS = 4;
const LEVELS = ['wind', 'sea', 'country', 'front', 'fronts', 'naval'];

export class Ambience {
  constructor(game) {
    this.game = game;
    this.volume = readVolume();
    this.muted = readMuted();
    this.ctx = null;
    this.master = null;
    this.scape = null;
    this.sentLevel = null;
    this.targets = Object.fromEntries(LEVELS.map((name) => [name, 0]));
    this.duck = 0;
    this.timer = 0;
    this.pumpTimer = 0;
    this.lastUpdate = 0;
    this.cost = { last: 0, max: 0, calls: 0 };
    // Sınama girdisi: başsızda deniz muharebesi üretilemezse bozulma yolu
    // buradan beslenir (injectNaval). Gerçek kaynak navyState.reports.
    this.navalTurnOverride = null;
    this.suspendTimer = 0;

    const schedule = () => this.schedule();
    for (const event of ['turn', 'clock', 'mapmode', 'frame', 'battles', 'diplomacy', 'world', 'player', 'navalReport']) {
      game.on(event, schedule);
    }
    // Menü, ülke seçimi ve yönetim ekranı yalnız gövde sınıfıyla duyurulur.
    new MutationObserver(schedule).observe(document.body, { attributes: true, attributeFilter: ['class'] });
    // Arka plandaki sekmede ses dönmesin. Doğrudan suspend DEĞİL: dönüşte
    // bağlam tam kazançta uyanıp sesi tek adımda başlatıyordu. Gizlenince
    // kazanç söner, askı sessizlik yolundan gelir; görününce yavaşça açılır.
    document.addEventListener('visibilitychange', () => this.update());
    this.armUnlock();
    this.mountSettings();
    this.schedule();
  }

  // ---- bağlam ve dosyalar ------------------------------------------------

  armUnlock() {
    if (navigator.userActivation?.hasBeenActive) { this.boot(); return; }
    const unlock = () => {
      document.removeEventListener('pointerdown', unlock, true);
      document.removeEventListener('keydown', unlock, true);
      this.boot();
    };
    document.addEventListener('pointerdown', unlock, true);
    document.addEventListener('keydown', unlock, true);
  }

  boot() {
    if (this.ctx) return;
    const Ctx = globalThis.AudioContext ?? globalThis.webkitAudioContext;
    if (!Ctx) return;
    try {
      // 48 kHz sabit: aygıt 192 kHz'te açılırsa gürültü tamponları dört kat tutar.
      this.ctx = new Ctx({ sampleRate: 48000 });
    } catch {
      try {
        this.ctx = new Ctx();
      } catch {
        return;
      }
    }
    this.master = this.ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(this.ctx.destination);
    this.scape = new Soundscape(this.ctx, this.master);
    this.schedule();
  }

  // ---- hedefler ----------------------------------------------------------

  /** Tek bekleyen zamanlayıcı: olay fırtınası (8x, kaydırma) tek hesaba iner. */
  schedule() {
    if (this.timer) return;
    const wait = Math.max(0, UPDATE_MS - (performance.now() - this.lastUpdate));
    this.timer = setTimeout(() => {
      this.timer = 0;
      this.update();
    }, wait);
  }

  update() {
    const t0 = performance.now();
    this.lastUpdate = t0;
    const { targets, duck } = this.compute();
    this.targets = targets;
    this.duck = duck;
    this.apply();
    const dt = performance.now() - t0;
    this.cost.last = dt;
    this.cost.max = Math.max(this.cost.max, dt);
    this.cost.calls++;
  }

  compute() {
    const game = this.game;
    const world = game.world;
    const body = document.body.classList;
    const pid = game.turns?.playerNation;
    const zero = Object.fromEntries(LEVELS.map((name) => [name, 0]));
    const shown = world && pid != null && world.nations?.[pid]
      && !body.contains('menu-open') && !body.contains('picker-open');
    if (!shown) return { targets: zero, duck: 0 };

    const cam = game.camera;
    // 0 = en uzak, 1 = yakın: logaritmik, çünkü zoom çarpanla değişir.
    const near = clamp01(Math.log(cam.zoom / 0.35) / Math.log(2.2 / 0.35));
    const seas = game.renderer?.mapMode === 'seas';
    const war = world.nations.some((n) => n.alive && n.id !== pid && atWar(world, pid, n.id));

    const t = { ...zero };
    const sea = this.seaShare(world, cam);
    // Yükseldikçe rüzgâr artar, yere inince yerin sesi gelir.
    t.wind = (0.3 + 0.3 * (1 - near)) * (war ? 0.75 : 1);
    t.sea = Math.min(0.85, sea * (0.45 + 0.4 * near) * (seas ? 1.5 : 1) + (seas ? 0.12 : 0));
    // Kır: kara üstünde ve yakında; savaşta kuşlar seyrekleşir.
    t.country = (1 - sea) * near ** 1.3 * (war ? 0.2 : 0.8);
    const front = this.frontLevel(world, cam, pid, near);
    t.front = front.level;
    t.fronts = front.count;
    t.naval = this.navalLevel(world, pid, seas && war);

    let duck = 1;
    if (body.contains('screen-open')) duck *= SCREEN_DUCK;
    if (!game.clock?.speed) duck *= PAUSE_DUCK;
    return { targets: t, duck };
  }

  /**
   * Görünen alanın deniz payı: 6×4'lük kaba ızgara (24 hex okuması). Kesin
   * sınır gerekmez; kulak yüzdeyi değil "kıyıda mı, açıkta mı"yı duyar.
   */
  seaShare(world, cam) {
    let water = 0;
    let seen = 0;
    for (let iy = 0; iy < 4; iy++) {
      for (let ix = 0; ix < 6; ix++) {
        const p = cam.screenToWorld((ix + 0.5) / 6 * cam.viewWidth, (iy + 0.5) / 4 * cam.viewHeight);
        const h = pixelToHex(p.x, p.y, HEX_SIZE);
        const tile = world.get(h.q, h.r);
        if (!tile) continue;
        seen++;
        if (tile.terrain?.water) water++;
      }
    }
    return seen ? water / seen : 0;
  }

  /**
   * Oyuncunun kara muharebeleri. Kulak menzili ekranın yarı genişliğinin
   * 1.6 katı: ekrandaki muharebe belirgin, kenarın biraz ötesindeki uzaktan
   * duyulur, daha ötesi hiç. Birden çok muharebe toplanır ama doyar
   * (1 − e^−Σ): on muharebe on kat gürültü değildir.
   */
  frontLevel(world, cam, pid, near) {
    const battles = world.battleSystem?.battles;
    if (!battles?.length) return { level: 0, count: 0 };
    const reach = Math.max(cam.viewWidth / (2 * cam.zoom), HEX_SIZE * 8) * 1.6;
    let sum = 0;
    let count = 0;
    for (const b of battles) {
      if (b.attackerNation !== pid && b.defenderNation !== pid) continue;
      const tile = world.get(b.q, b.r);
      if (!tile) continue;
      let dx = Math.abs(tile.x - cam.x);
      if (cam.wrapX) dx = Math.min(dx, cam.wrapX - (dx % cam.wrapX));
      const w = clamp01(1 - Math.hypot(dx, tile.y - cam.y) / reach);
      if (w <= 0) continue;
      count++;
      sum += w ** 1.5;
    }
    if (!count) return { level: 0, count: 0 };
    return { level: (1 - Math.exp(-1.4 * sum)) * (0.3 + 0.7 * near), count };
  }

  /** Bu hafta deniz muharebesi: sonra birkaç haftada söner. */
  navalLevel(world, pid, seaWar) {
    const turn = this.game.turns?.turn ?? world.turn ?? 0;
    let last = this.navalTurnOverride ?? -Infinity;
    for (const report of world.navyState?.reports ?? []) {
      if (report.turn > last && report.sides?.some((side) => side.nations?.includes(pid))) last = report.turn;
    }
    const age = turn - last;
    const fight = age >= 0 && age <= NAVAL_WEEKS ? 0.6 * Math.exp(-age / 1.5) : 0;
    return Math.max(fight, seaWar ? 0.15 : 0);
  }

  apply() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    // Aynı hedefi yeniden yazmak 4 Hz'de zaman çizelgesine olay yığar:
    // Soundscape.set yalnız değişen katmanı yazar.
    this.scape.set(this.targets, now);
    const hidden = document.visibilityState === 'hidden';
    const level = this.muted || hidden ? 0 : (this.volume / 100) * this.duck * MIX_TRIM;
    if (level !== this.sentLevel) {
      // Sessizlikten sese yavaş, kısmaya çabuk: açılışta sıçrama yok.
      const tau = !(this.sentLevel > 0.001) ? MASTER_TAU : DUCK_TAU;
      this.sentLevel = level;
      this.master.gain.setTargetAtTime(level, now, tau);
    }
    // Sessizlikte bağlam askıya alınır: ana menüde ses boşa dönmesin.
    clearTimeout(this.suspendTimer);
    if (level > 0) {
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      this.startPump();
    } else if (this.ctx.state === 'running') {
      this.suspendTimer = setTimeout(() => {
        if (this.master.gain.value < 0.001) {
          this.stopPump();
          this.ctx.suspend().catch(() => {});
        }
      }, 2000);
    }
  }

  /** Olay yazıcısı: yalnız ses açıkken; bağlam askıdayken boşa yazmaz. */
  startPump() {
    if (this.pumpTimer) return;
    const pump = () => {
      if (this.ctx.state === 'running') this.scape.pump(this.ctx.currentTime + LOOKAHEAD_S);
    };
    pump();
    this.pumpTimer = setInterval(pump, PUMP_MS);
  }

  stopPump() {
    clearInterval(this.pumpTimer);
    this.pumpTimer = 0;
  }

  // ---- denetim -----------------------------------------------------------

  setVolume(value) {
    this.volume = Math.max(0, Math.min(100, Math.round(value)));
    writeVolume(this.volume);
    this.update();
    this.syncSettings();
  }

  setMuted(muted) {
    this.muted = Boolean(muted);
    writeMuted(this.muted);
    this.update();
    this.syncSettings();
  }

  /** Sınama: bu hafta oyuncunun bir deniz muharebesi olmuş gibi. */
  injectNaval(turn = this.game.turns?.turn ?? 0) {
    this.navalTurnOverride = turn;
    this.update();
  }

  /** Konsol: game.ambience.state() — hedefler, kazançlar, olay sayaçları. */
  state() {
    const sc = this.scape;
    const gain = (node) => round(node?.gain.value ?? 0);
    return {
      context: this.ctx?.state ?? 'none',
      sampleRate: this.ctx?.sampleRate ?? 0,
      volume: this.volume,
      muted: this.muted,
      duck: round(this.duck),
      master: round(this.master?.gain.value ?? 0),
      targets: Object.fromEntries(LEVELS.map((name) => [name, round(this.targets[name])])),
      buses: sc ? { wind: gain(sc.windBus), sea: gain(sc.seaBus), country: gain(sc.countryBus), front: gain(sc.frontBus) } : null,
      events: sc ? { ...sc.counts, voices: sc.playing() } : null,
      cost: { lastMs: round(this.cost.last, 4), maxMs: round(this.cost.max, 4), calls: this.cost.calls },
    };
  }

  // ---- ayar paneli -------------------------------------------------------

  /**
   * Oyun içi Settings paneline (#settings) "audio" satırı: sessiz düğmesi
   * (§69 ikincil rol: .action) ve Ambience kaydırıcısı (.field, panelin
   * "Map size: 160" dizgisiyle). Panel sabit işaretleme; denetim burada
   * eklenir ki index.html bu özelliğe bağımlı olmasın (gfxStyleMenu gibi).
   */
  mountSettings() {
    const panel = document.getElementById('settings');
    if (!panel || panel.querySelector('.amb-settings')) return;
    const box = document.createElement('div');
    box.className = 'amb-settings';
    box.style.display = 'contents';
    const head = document.createElement('div');
    head.className = 'action-row';
    head.style.marginTop = '14px';
    const k = document.createElement('div');
    k.className = 'k';
    k.textContent = 'audio';
    const mute = document.createElement('button');
    mute.className = 'action';
    mute.id = 'btn-ambience-mute';
    mute.addEventListener('click', () => this.setMuted(!this.muted));
    head.append(k, mute);
    const label = document.createElement('label');
    label.className = 'field';
    const span = document.createElement('span');
    const val = document.createElement('b');
    span.append('Ambience: ', val);
    const input = document.createElement('input');
    input.type = 'range';
    input.id = 'in-ambience';
    input.min = '0';
    input.max = '100';
    input.step = '1';
    input.addEventListener('input', () => {
      // Sürüklerken yalnız ana kazanç oynar; hedef hesabı gerekmez.
      this.volume = Number(input.value);
      val.textContent = String(this.volume);
      this.apply();
    });
    input.addEventListener('change', () => this.setVolume(Number(input.value)));
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
    this.ui.mute.textContent = this.muted ? 'Unmute ambience' : 'Mute ambience';
    this.ui.mute.setAttribute('aria-pressed', this.muted ? 'true' : 'false');
  }
}

function clamp01(x) {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

function round(x, digits = 3) {
  const f = 10 ** digits;
  return Math.round(x * f) / f;
}

function readVolume() {
  try {
    const raw = localStorage.getItem(VOLUME_KEY);
    const n = Number(raw);
    return raw != null && Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : DEFAULT_VOLUME;
  } catch {
    return DEFAULT_VOLUME;
  }
}

function writeVolume(value) {
  try {
    localStorage.setItem(VOLUME_KEY, String(value));
  } catch {
    // Depolama kapalı (gizli sekme): tercih oturumla sınırlı kalır.
  }
}

function readMuted() {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

function writeMuted(muted) {
  try {
    localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
  } catch {
    // Depolama kapalı: tercih oturumla sınırlı kalır.
  }
}
