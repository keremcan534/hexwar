// Harita ambiyansı: rüzgâr, deniz, savaş yağmuru, cephe, deniz topçusu.
//
// LİSANS NOTU (yayından ÖNCE okunmalı): assets/audio/ambience/ altındaki beş
// döngü YEREL SINAMA sesidir. Yalnız rüzgâr kaydı "No Copyright" diye
// yayımlanmıştı; deniz, yağmur+topçu, WW1 cephesi ve yelkenli topçusu
// YouTube kanallarından, lisansı belirsiz. Klasör .gitignore'dadır, depoya
// girmez; yayından önce CC0/lisanslı kayıtlarla değiştirilmeli. İşleme hattı
// (ffmpeg): olay yoğun, kırpılmamış 120-140 s'lik parça (10 s pencerede
// ebur128 + astats), -26 LUFS loudnorm, kuyruk başa 4 s eşit güçle bindirilip
// dikişsiz döngü, Opus/Ogg 72 kbps. Dosya yoksa o katman sessiz kalır.
//
// Neden böyle kuruldu:
// - Web Audio: beş katman aynı anda döner, her birinin kendi kazancı var;
//   Audio elemanında döngü dikişi duyulur ve kazançlar arası geçiş setInterval
//   ister. Tek AudioContext, tek ana kazanç; her tampon ilk duyulacağı an
//   bir kez çözülür (tembel: menüde hiç, barışta yalnız rüzgâr + deniz).
// - Sürekli rAF YOK. Hedefler oyun olaylarında (hafta, harita kipi, muharebe,
//   kare = kamera) yeniden hesaplanır ve tek zamanlayıcıyla saniyede en çok
//   dört kez; geçişleri AudioParam.setTargetAtTime kendisi yürütür.
// - Tarayıcı kullanıcı dokunmadan sesi engeller: bağlam ilk dokunuş/tuşta
//   kurulur (menuMusic.js ile aynı yol), önce kurulursa konsola uyarı düşer.
// - Ana menüde ve kampanya başlamadan ambiyans yok: menünün müziği var.
//
// Katman notu: ui katmanıdır; oyun durumunu OKUR, oyuna yazmaz. Oyun bu
// dosyayı bilmez (game.ambience yalnız konsol denetimi için bağlanır).

import { atWar } from '../game/diplomacy.js';
import { pixelToHex } from '../core/hex.js';
import { HEX_SIZE } from '../world/worldgen.js';

const BASE = 'assets/audio/ambience/';
const LAYERS = ['wind', 'ocean', 'war-rain', 'front', 'naval'];

const VOLUME_KEY = 'hexwar:ambience-volume';
const MUTE_KEY = 'hexwar:ambience-muted';
const DEFAULT_VOLUME = 60;

/** Hedef hesabı en sık bu aralıkla: kamera kaydırması kare başına tetikler. */
const UPDATE_MS = 250;
/** Katman geçişinin zaman sabiti (s): ~3τ'da hedefe varır, kesme duyulmaz. */
const TAU = 0.7;
/** Ekran/duraklatma kısması daha çabuk oturmalı: oyuncu tıkladığını duysun. */
const DUCK_TAU = 0.25;
/** Yönetim ekranı açıkken: −8 dB. */
const SCREEN_DUCK = 0.4;
/** Duraklatılmış oyun: dünya yaşıyor hissi kalsın, ama geri çekilsin. */
const PAUSE_DUCK = 0.65;
/** Deniz muharebesinin sesi bu kadar haftada söner. */
const NAVAL_WEEKS = 4;

export class Ambience {
  constructor(game) {
    this.game = game;
    this.volume = readVolume();
    this.muted = readMuted();
    this.ctx = null;
    this.master = null;
    this.layers = Object.fromEntries(LAYERS.map((name) => [name, {
      gain: null, buffer: null, source: null, state: 'idle', target: 0, sent: null,
    }]));
    this.sentLevel = null;
    this.targets = Object.fromEntries(LAYERS.map((name) => [name, 0]));
    this.duck = 0;
    this.timer = 0;
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
    // Arka plandaki sekmede döngü çalmaya devam etmesin. Doğrudan suspend
    // DEĞİL: dönüşte bağlam tam kazançta uyanıp sesi tek adımda başlatıyordu
    // (ölçüldü: resume anında ana kazanç 0.39). Gizlenince kazanç söner, askı
    // sessizlik yolundan gelir; görününce sıfırdan açılır.
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
      // 48 kHz sabit: tamponlar bağlamın hızında çözülür; aygıt 192 kHz'te
      // açılırsa (başsızda ölçüldü) beş döngü 708 MB tutuyordu, 48 kHz'te ~177.
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
    for (const name of LAYERS) {
      const layer = this.layers[name];
      layer.gain = this.ctx.createGain();
      layer.gain.gain.value = 0;
      layer.gain.connect(this.master);
    }
    this.schedule();
  }

  /**
   * Katman ilk kez duyulacağı an yüklenir: menüde hiçbir şey çözülmez,
   * barışta yalnız rüzgâr + deniz (~35 MB); savaş katmanları ilk savaşta.
   * Önce rüzgâr: klasör hiç yoksa (depodan temiz çekilmiş kopya) tek istek
   * başarısız olur, öteki dört istek hiç atılmaz ve konsolda tek ağ satırı
   * kalır.
   */
  want(name) {
    const layer = this.layers[name];
    if (layer.state !== 'idle') return;
    if (name !== 'wind') {
      if (this.layers.wind.state === 'idle') this.want('wind');
      if (this.layers.wind.state !== 'ready') return;
    }
    this.load(name).then((ok) => {
      if (!ok && name === 'wind') {
        for (const n of LAYERS) if (this.layers[n].state === 'idle') this.layers[n].state = 'skipped';
      }
      this.schedule();
    });
  }

  async load(name) {
    const layer = this.layers[name];
    layer.state = 'loading';
    try {
      const res = await fetch(`${BASE}${name}.ogg`);
      if (!res.ok) throw new Error(String(res.status));
      layer.buffer = await this.ctx.decodeAudioData(await res.arrayBuffer());
    } catch {
      layer.state = 'missing';
      return false;
    }
    const source = this.ctx.createBufferSource();
    source.buffer = layer.buffer;
    source.loop = true;
    source.connect(layer.gain);
    // Döngüler aynı anda başlarsa katmanlar her açılışta aynı anı birlikte
    // çalar; rastgele ofset tekrarı dağıtır.
    source.start(0, Math.random() * layer.buffer.duration);
    layer.source = source;
    layer.state = 'ready';
    return true;
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
    const zero = Object.fromEntries(LAYERS.map((name) => [name, 0]));
    const shown = world && pid != null && world.nations?.[pid]
      && !body.contains('menu-open') && !body.contains('picker-open');
    if (!shown) return { targets: zero, duck: 0 };

    const cam = game.camera;
    // 0 = en uzak, 1 = yakın: logaritmik, çünkü zoom çarpanla değişir.
    const near = clamp01(Math.log(cam.zoom / 0.35) / Math.log(2.2 / 0.35));
    const seas = game.renderer?.mapMode === 'seas';
    const war = world.nations.some((n) => n.alive && n.id !== pid && atWar(world, pid, n.id));

    const t = { ...zero };
    t.wind = (0.32 + 0.28 * (1 - near)) * (war ? 0.3 : 1);
    const sea = this.seaShare(world, cam);
    t.ocean = Math.min(0.9, sea * (0.5 + 0.2 * near) * (seas ? 1.6 : 1) + (seas ? 0.18 : 0));
    t['war-rain'] = war ? 0.42 : 0;
    t.front = this.frontLevel(world, cam, pid, near);
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
   * Oyuncunun kara muharebesi: uzakta alçak bir uğultu, kamera yanına
   * yaklaştıkça yükselir. Mesafe ekranın yarı genişliğine göre ölçülür:
   * ekrandaki muharebe duyulur, ekran dışındaki yalnız uzaktan.
   */
  frontLevel(world, cam, pid, near) {
    const battles = world.battleSystem?.battles;
    if (!battles?.length) return 0;
    const half = cam.viewWidth / (2 * cam.zoom);
    let best = Infinity;
    for (const b of battles) {
      if (b.attackerNation !== pid && b.defenderNation !== pid) continue;
      const tile = world.get(b.q, b.r);
      if (!tile) continue;
      let dx = Math.abs(tile.x - cam.x);
      if (cam.wrapX) dx = Math.min(dx, cam.wrapX - (dx % cam.wrapX));
      best = Math.min(best, Math.hypot(dx, tile.y - cam.y));
    }
    if (best === Infinity) return 0;
    const close = clamp01(1 - best / Math.max(half, HEX_SIZE * 8));
    return 0.1 + 0.65 * close * (0.25 + 0.75 * near);
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
    return Math.max(fight, seaWar ? 0.22 : 0);
  }

  apply() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    let ready = false;
    for (const name of LAYERS) {
      const layer = this.layers[name];
      layer.target = this.targets[name];
      if (layer.target > 0) this.want(name);
      // Hazır olmayan katmanın kazancı 0'da bekler: geç yüklenen döngü
      // yarım yolda kalmış bir rampaya değil, sıfırdan açılır.
      if (layer.state !== 'ready') continue;
      ready = true;
      // Aynı hedefi yeniden yazmak 4 Hz'de zaman çizelgesine olay yığar.
      if (layer.sent === layer.target) continue;
      layer.sent = layer.target;
      layer.gain.gain.setTargetAtTime(layer.target, now, TAU);
    }
    // Çalacak dosya yoksa (temiz kopya) bağlam boşa dönmesin: sessizlik
    // yolu onu askıya alır ve bir daha uyandırmaz.
    const hidden = document.visibilityState === 'hidden';
    const level = this.muted || hidden || !ready ? 0 : (this.volume / 100) * this.duck;
    if (level !== this.sentLevel) {
      this.sentLevel = level;
      this.master.gain.setTargetAtTime(level, now, DUCK_TAU);
    }
    // Sessizlikte bağlam askıya alınır: ana menüde beş döngü boşa dönmesin.
    clearTimeout(this.suspendTimer);
    if (level > 0) {
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    } else if (this.ctx.state === 'running') {
      this.suspendTimer = setTimeout(() => {
        if (this.master.gain.value < 0.001) this.ctx.suspend().catch(() => {});
      }, 2000);
    }
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

  /** Konsol: game.ambience.state() — hedefler ve o anki kazançlar. */
  state() {
    const layers = {};
    let bytes = 0;
    for (const name of LAYERS) {
      const layer = this.layers[name];
      layers[name] = {
        target: round(this.targets[name]),
        gain: round(layer.gain?.gain.value ?? 0),
        file: layer.state,
      };
      if (layer.buffer) bytes += layer.buffer.length * layer.buffer.numberOfChannels * 4;
    }
    return {
      context: this.ctx?.state ?? 'none',
      sampleRate: this.ctx?.sampleRate ?? 0,
      decodedMB: Math.round(bytes / 1048576),
      volume: this.volume,
      muted: this.muted,
      duck: round(this.duck),
      master: round(this.master?.gain.value ?? 0),
      layers,
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
