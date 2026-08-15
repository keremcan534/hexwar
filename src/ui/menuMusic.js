// Ana menü müziği.
//
// Üç kural belirledi bu dosyayı:
//
// 1. Tarayıcı, kullanıcı sayfaya dokunmadan ses çalmayı ENGELLER. `play()`
//    sessizce reddedilir. Bu yüzden bir kez denenir, reddedilirse ilk
//    dokunuşu/tuşu bekleyen tek seferlik bir dinleyici kurulur.
// 2. Müzik menünün perdesiyle birlikte gelir gider: sert kesme yerine
//    yumuşak geçiş (fade). Kampanya başlarken menü müziği susar.
// 3. Oyuncunun kararı kalıcıdır: sesi kapattıysa bir dahaki açılışta da
//    kapalı gelir.
//
// Katman notu: DOM'a dokunur (Audio elemanı), oyun durumuna dokunmaz.

const TRACKS = [
  { src: 'assets/music/imperia.mp3', title: 'Imperia' },
  { src: 'assets/music/faded-rose.mp3', title: 'Faded Rose' },
];

const MUTE_KEY = 'hexwar:menu-muted';
const VOLUME_KEY = 'hexwar:menu-volume';
/** Varsayılan ses düzeyi. Fon müziği konuşmayı bastırmamalı. */
const VOLUME = 0.42;
const FADE_MS = 900;

export class MenuMusic {
  constructor() {
    this.audio = new Audio();
    this.audio.preload = 'auto';
    // Liste kendi içinde döner; tek parça loop'u birkaç dakikada bıktırıyor.
    this.audio.loop = false;
    this.audio.volume = 0;
    this.index = 0;
    this.muted = readMuted();
    this.level = readVolume();
    this.fade = 0;
    this.wanted = false;
    this.unlocked = false;
    this.audio.addEventListener('ended', () => this.next());
    // Kaynak bulunamazsa (dosya taşınmış) menü çalışmaya devam etmeli.
    this.audio.addEventListener('error', () => { if (this.wanted) this.next(); });
    this.load(0);
  }

  load(index) {
    this.index = ((index % TRACKS.length) + TRACKS.length) % TRACKS.length;
    this.audio.src = TRACKS[this.index].src;
  }

  get trackTitle() {
    return TRACKS[this.index].title;
  }

  /** Künyede geçen parça listesi. */
  get trackList() {
    return TRACKS.map((track) => track.title).join(' · ');
  }

  /**
   * Ses düzeyi. Sürükleme sırasında fade çalıştırmak sesi titretiyor; değer
   * doğrudan yazılır ve fade zamanlayıcısı iptal edilir.
   */
  setVolume(level) {
    this.level = Math.max(0, Math.min(1, level));
    writeVolume(this.level);
    // Sıfıra çekmek "sessiz"e denktir: iki kontrol birbiriyle tutarlı kalsın.
    const silent = this.level <= 0.001;
    if (silent !== this.muted) {
      this.muted = silent;
      writeMuted(this.muted);
    }
    clearInterval(this.fade);
    this.fade = 0;
    this.audio.volume = this.muted ? 0 : this.level;
    if (this.muted) this.audio.pause();
    else if (this.wanted && this.audio.paused) this.attempt();
  }

  /** Menü açıldı: çalmayı dene, engellenirse ilk dokunuşu bekle. */
  start() {
    this.wanted = true;
    if (this.muted) return;
    this.attempt();
  }

  attempt() {
    const promise = this.audio.play();
    if (!promise?.catch) { this.fadeTo(this.level); return; }
    promise.then(() => {
      this.unlocked = true;
      this.fadeTo(this.level);
    }).catch(() => {
      // Otomatik oynatma politikası: ilk kullanıcı hareketinde tekrar denenir.
      if (this.unlocked) return;
      const unlock = () => {
        document.removeEventListener('pointerdown', unlock);
        document.removeEventListener('keydown', unlock);
        if (this.wanted && !this.muted) this.attempt();
      };
      document.addEventListener('pointerdown', unlock, { once: true });
      document.addEventListener('keydown', unlock, { once: true });
    });
  }

  next() {
    this.load(this.index + 1);
    if (this.wanted && !this.muted) this.attempt();
  }

  /** Menü kapandı: sustur ve durdur (kampanya kendi sesini kuracak). */
  stop() {
    this.wanted = false;
    this.fadeTo(0, () => {
      this.audio.pause();
      this.audio.currentTime = 0;
      // Bir sonraki açılış listenin başındaki parçayla değil, sıradakiyle
      // gelsin: aynı melodi her açılışta tekrar etmesin.
      this.load(this.index + 1);
    });
  }

  toggleMute() {
    this.muted = !this.muted;
    writeMuted(this.muted);
    if (this.muted) {
      this.fadeTo(0, () => this.audio.pause());
    } else {
      // Kaydırıcı sıfıra çekilerek susturulmuşsa sesi açmak sessizliğe
      // dönmemeli: düzey varsayılana geri gelir.
      if (this.level <= 0.001) { this.level = VOLUME; writeVolume(this.level); }
      if (this.wanted) this.attempt();
    }
    return this.muted;
  }

  /** Doğrusal ses geçişi. Tek zamanlayıcı: üst üste binen fade'ler sıçratır. */
  fadeTo(target, done) {
    clearInterval(this.fade);
    const from = this.audio.volume;
    const steps = Math.max(1, Math.round(FADE_MS / 40));
    let step = 0;
    this.fade = setInterval(() => {
      step++;
      const t = Math.min(1, step / steps);
      this.audio.volume = Math.max(0, Math.min(1, from + (target - from) * t));
      if (t >= 1) {
        clearInterval(this.fade);
        this.fade = 0;
        done?.();
      }
    }, 40);
  }
}

function readVolume() {
  try {
    const raw = Number(localStorage.getItem(VOLUME_KEY));
    return Number.isFinite(raw) && raw > 0 ? Math.min(1, raw) : VOLUME;
  } catch {
    return VOLUME;
  }
}

function writeVolume(level) {
  try {
    localStorage.setItem(VOLUME_KEY, String(level));
  } catch {
    // Depolama kapali: tercih oturumla sinirli kalir.
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
    // Depolama kapalı (gizli sekme): tercih oturumla sınırlı kalır.
  }
}
