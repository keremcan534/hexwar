// Ana menü: oyunun açılış perdesi.
//
// Kurgu (bkz. styles.css "18. ANA MENU"): kimlik ÜSTTE ortada, amblem
// MERKEZDE, tek birincil eylem ALTTA, seçenekler SOLDA dar bir ikon şeridinde.
// Şerit fareyle üzerine gelince sağa açılıp adları gösterir; alt görünümler
// (kurulum, ayarlar, künye) şeridin yanından açılan çekmeceye düşer.
// Grand strategy açılışları gibi sahneli ve ağır, ama oyunun kendi dilinde:
// koyu cam, pirinç saç teli çizgi, keskin köşe.
//
// Fon resimleri ve müzik depoya konmuş varlıklardır (assets/menu, assets/music).
// Projenin geri kalanı dokularını çalışma anında üretir (bkz. render/textures.js);
// bu dosya o kuralın bilinçli istisnasıdır — mat resim oyuncunun gördüğü ilk şey
// ve elle yapılmış bir kompozisyon.
//
// Perdenin üstünde iki katman daha var: sürüklenen sis (CSS ile hareket eder,
// bkz. .menu-fog) ve müzik (bkz. menuMusic.js).
//
// Menüde olmayan özelliğin düğmesi yoktur: "Continue" ancak oturumda yüklü
// oyun varsa, "Load Game" ancak diskte kayıt varsa çıkar.
//
// Katman notu: DOM'a dokunur, oyun durumunu yalnız `game` üzerinden değiştirir.

import { SAVE_VERSION, savedInfo } from '../game/save.js';
import { gameDate } from './hud.js';
import { worldRows } from '../world/worldgen.js';
import { MenuMusic } from './menuMusic.js';

/**
 * Oyunun adı. Menüde tek yerden yazılır; başlığı değiştirmek için markup'a
 * ya da CSS'e dokunmak gerekmez.
 */
export const GAME_TITLE = 'Imperial Eye';
export const GAME_EYEBROW = 'The Long Century · 1836';
/** Alt şeritteki sürüm künyesi. Kayıt biçimi sürümü de burada okunur. */
export const BUILD_LABEL = `v0.1.0 · save ${SAVE_VERSION}`;

/**
 * Açılış sahneleri. Her uygulama açılışında sıradaki gelir; ayarlardan elle
 * de seçilebilir.
 *
 * Her sahnenin dört alanı var:
 *   src      — resim
 *   position — `object-position`: sahnenin odağı kadrajda nereye düşecek
 *   filter   — ton düzeltmesi; resimlerin ışığı birbirini tutmuyor
 *   theme    — CSS'teki vurgu paleti (bkz. .menu[data-theme])
 *   label    — ayarlardaki sahne etiketi
 *   tagline  — panelin motto satırı
 *
 * Ortak kural: kimlik ve amblem sahnenin ORTASINDA durur, o yüzden her sahnenin
 * merkezi sakin kalmalı; kalabalık ve parlak odak kenarlara düşmeli.
 *
 * Resimler JPEG: fon fotoğrafı PNG olarak 2,4 MB tutuyordu ve menü sekiz sahne
 * arasında dönüyor. Kalite 92'de fark görünmüyor, boyut yedide bire iniyor.
 */
const SCENES = [
  {
    src: 'assets/menu/main-menu.jpg',
    // Yanan kıyı şeridi resmin üst üçte birinde; merkezden kırpınca kesiliyor.
    position: '50% 42%',
    filter: 'saturate(0.88) contrast(1.04) brightness(0.94)',
    theme: 'bombardment',
    label: 'Bombardment',
    tagline: 'A coastline under the guns, an empire behind them.',
  },
  {
    src: 'assets/menu/palace-hall.jpg',
    // Işık huzmeleri ve zemin yansıması alt yarıda; biraz aşağı bakılır.
    position: '50% 54%',
    // Zaten koyu ve çok mavi: kısmak yerine hafif ısıtılır.
    filter: 'saturate(0.78) contrast(1.06) brightness(1.02)',
    theme: 'imperial-hall',
    label: 'Imperial Hall',
    tagline: 'Empires are lost in quiet halls long before they are lost at sea.',
  },
  {
    src: 'assets/menu/harbour-dawn.jpg',
    // Ay ışığının suya düşen sütunu ortada; vinçler sağda. Merkez kırpma tutar.
    position: '50% 50%',
    // Neredeyse tek renk: kontrastı açmazsak kurşuni bir levha gibi duruyor.
    filter: 'saturate(0.72) contrast(1.14) brightness(0.98)',
    theme: 'harbour',
    label: 'Harbour',
    tagline: 'Every empire is a ledger of ships that came home.',
  },
  {
    src: 'assets/menu/palace-square.jpg',
    // Sütunlu cephe solda: raf tam onun üstüne oturur, koyu kalır.
    position: '50% 52%',
    filter: 'saturate(0.76) contrast(1.08) brightness(1.0)',
    theme: 'rainy-capital',
    label: 'Rainy Capital',
    tagline: 'The rain washes the square; it never washes the treaty.',
  },
  {
    src: 'assets/menu/rail-yard.jpg',
    // Gökyüzü kadrajın üst yarısını yiyor; makaslar görünsün diye aşağı bakılır.
    position: '50% 62%',
    filter: 'saturate(0.8) contrast(1.1) brightness(0.95)',
    theme: 'rail-yard',
    label: 'Marshalling Yard',
    tagline: 'Timetables move armies. Generals only sign for them.',
  },
  {
    src: 'assets/menu/coast-fort.jpg',
    // Toplar ve surlar sağ yarıda; sol yarı deniz, raf için ideal.
    position: '50% 50%',
    filter: 'saturate(0.74) contrast(1.1) brightness(0.97)',
    theme: 'coast-fort',
    label: 'Coastal Fort',
    tagline: 'A gun on a headland is an argument the sea must answer.',
  },
  {
    src: 'assets/menu/tulip-night.jpg',
    // Hilal sağ üstte, tarlanın ufku ortada; yukarı kayarsa ay kesiliyor.
    position: '50% 46%',
    // Gece sahnesi: zaten koyu, karartma yok — hafif açılır.
    filter: 'saturate(0.9) contrast(1.05) brightness(1.06)',
    theme: 'crescent-night',
    label: 'Crescent Night',
    tagline: 'Fortunes were made and ruined here, over flowers.',
  },
  {
    src: 'assets/menu/field-road.jpg',
    // Ufuk çizgisi ortada; gökyüzü ile çamurlu yol birlikte kalsın.
    position: '50% 48%',
    // En soluk sahne; kontrast biraz açılır yoksa gri bir yüzey gibi duruyor.
    filter: 'saturate(0.9) contrast(1.12) brightness(0.92)',
    theme: 'field-road',
    label: 'Field Road',
    tagline: 'Roads decide campaigns long before the armies meet.',
  },
];

const SCENE_KEY = 'hexwar:menu-scene';

/**
 * Sıradaki sahne indeksi. Sayaç depolamada tutulur — "sırayla" oturum içinde
 * değil, açılıştan açılışa ilerler. Depolama kapalıysa (gizli sekme) ilk
 * sahneye düşer; menü resimsiz kalmaz.
 */
function nextSceneIndex() {
  let index = 0;
  try {
    index = (Number(localStorage.getItem(SCENE_KEY)) || 0) % SCENES.length;
    localStorage.setItem(SCENE_KEY, String((index + 1) % SCENES.length));
  } catch (err) {
    index = 0;
  }
  return index;
}

/** Kayıt künyesi: "seed 4KZQ81 · 14 MAR 1851". */
function saveLabel(info) {
  if (!info) return '';
  const parts = [];
  if (info.seed) parts.push(`seed ${info.seed}`);
  if (info.turn) parts.push(gameDate(info.turn));
  return parts.join(' · ');
}

export class MainMenu {
  /**
   * @param {object} game
   * @param {{ resumable?: boolean }} options `resumable` açılışta kaydın
   *   gerçekten yüklendiğini söyler; menü kapanınca oyun oradan devam eder.
   */
  constructor(game, { resumable = false } = {}) {
    this.game = game;
    this.resumable = resumable;
    this.open_ = false;
    this.sceneIndex = 0;

    const $ = (id) => document.getElementById(id);
    this.el = {
      root: $('menu'),
      art: $('menu-art'),
      title: $('menu-title'),
      eyebrow: document.querySelector('.menu-eyebrow'),
      tagline: $('menu-tagline'),
      resume: $('menu-resume'),
      resumeNote: $('menu-resume-note'),
      create: $('menu-create'),
      load: $('menu-load'),
      loadNote: $('menu-load-note'),
      random: $('menu-random'),
      settings: $('menu-settings'),
      credits: $('menu-credits'),
      exit: $('menu-exit'),
      drawer: $('menu-drawer'),
      drawerTitle: $('menu-drawer-title'),
      drawerClose: $('menu-drawer-close'),
      cta: $('menu-cta'),
      ctaLabel: $('menu-cta-label'),
      ctaNote: $('menu-cta-note'),
      setup: $('menu-setup'),
      options: $('menu-options'),
      creditsView: $('menu-credits-view'),
      creditsMusic: $('menu-credits-music'),
      back: $('menu-back'),
      build: $('menu-build'),
      seed: $('menu-seed'),
      size: $('menu-size'),
      cont: $('menu-cont'),
      land: $('menu-land'),
      nations: $('menu-nations'),
      sizeLabel: $('menu-size-label'),
      contLabel: $('menu-cont-label'),
      landLabel: $('menu-land-label'),
      nationsLabel: $('menu-nations-label'),
      volume: $('menu-volume'),
      volumeLabel: $('menu-volume-label'),
      themeList: $('menu-theme-list'),
      motionNote: $('menu-motion-note'),
      mute: $('menu-mute'),
      sceneBtn: $('menu-scene'),
      buildInfo: $('menu-build-info'),
    };

    this.music = new MenuMusic();

    // Kimlik ve künye markup'tan değil buradan gelir: ismi değiştirmek tek
    // sabiti değiştirmektir (bkz. GAME_TITLE).
    if (this.el.title) this.el.title.textContent = GAME_TITLE;
    if (this.el.eyebrow) this.el.eyebrow.textContent = GAME_EYEBROW;
    if (this.el.buildInfo) this.el.buildInfo.textContent = BUILD_LABEL;

    // Sahne yapıcıda seçilir: menü açıldığında resim çoktan yüklenmeye
    // başlamış olsun, perde boş bir kare göstermesin.
    this.setScene(nextSceneIndex());
    this.buildThemeChips();
    this.bind();
    this.syncMute();
    this.syncVolume();
    this.syncMotionNote();
  }

  /**
   * Sahneyi ve temayı birlikte kurar. Tema yalnız vurgu tonunu oynatır;
   * yapı, opaklık ve köşe yarıçapı her temada aynı kalır.
   */
  setScene(index) {
    const scene = SCENES[((index % SCENES.length) + SCENES.length) % SCENES.length];
    if (!scene) return;
    this.sceneIndex = SCENES.indexOf(scene);
    const { art, tagline, root } = this.el;
    if (art) {
      // index.html ilk sahneyi taşır; aynı kaynağa yeniden atamak yükleme
      // başlatmaz, farklıysa tarayıcı hemen indirmeye başlar.
      if (!art.src.endsWith(scene.src)) {
        art.src = scene.src;
        // Giriş animasyonunu yeniden tetikle: aynı sınıf kalınca resim
        // sessizce takas oluyordu.
        art.style.animation = 'none';
        void art.offsetWidth;
        art.style.animation = '';
      }
      art.style.objectPosition = scene.position;
      art.style.filter = scene.filter;
    }
    // Metin sahneye bağlı: tek bir cümle sekiz resmin sekizinde birden durmuyor.
    if (tagline && scene.tagline) tagline.textContent = scene.tagline;
    if (root) root.dataset.theme = scene.theme;
    this.syncThemeChips();
  }

  /** Ayarlardaki sahne etiketleri. Liste SCENES'ten türer, elle yazılmaz. */
  buildThemeChips() {
    const { themeList } = this.el;
    if (!themeList) return;
    themeList.textContent = '';
    SCENES.forEach((scene, index) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'menu-chip';
      chip.textContent = scene.label;
      chip.setAttribute('aria-pressed', 'false');
      chip.onclick = () => {
        this.setScene(index);
        // Elle seçilen sahne bir sonraki açılışta tekrar gelmesin: sayaç
        // seçilenin BİR SONRASINA kurulur.
        try {
          localStorage.setItem(SCENE_KEY, String((index + 1) % SCENES.length));
        } catch (err) { /* depolama kapalı: seçim oturumla sınırlı */ }
      };
      themeList.append(chip);
    });
    this.syncThemeChips();
  }

  syncThemeChips() {
    const chips = this.el.themeList?.children;
    if (!chips) return;
    for (let i = 0; i < chips.length; i++) {
      chips[i].setAttribute('aria-pressed', i === this.sceneIndex ? 'true' : 'false');
    }
  }

  bind() {
    const { el } = this;

    el.resume.onclick = () => this.close();
    el.random.onclick = () => {
      this.game.newWorld();
      this.close();
    };
    el.create.onclick = () => this.showView('setup');
    el.settings.onclick = () => this.showView('options');
    el.credits.onclick = () => this.showView('credits');
    el.back.onclick = () => this.showView('actions');
    el.drawerClose.onclick = () => this.showView('actions');
    // Birincil eylem: kayıt varsa kampanyayı sürdürür, yoksa yeni dünya kurar.
    el.cta.onclick = () => {
      if (!this.resumable) this.game.newWorld();
      this.close();
    };
    el.build.onclick = () => this.build();
    el.load.onclick = () => this.loadSave();
    el.exit.onclick = () => this.exit();
    for (const button of el.root.querySelectorAll('[data-menu-back]')) {
      button.onclick = () => this.showView('actions');
    }

    if (el.mute) {
      el.mute.onclick = () => {
        this.music.toggleMute();
        this.syncMute();
      };
    }
    // Sahne düğmesi: bir sonraki sahneye geçer. Temayı denemek için ayarlara
    // girmek gerekmesin.
    if (el.sceneBtn) el.sceneBtn.onclick = () => this.setScene(this.sceneIndex + 1);
    if (el.volume) {
      el.volume.oninput = () => {
        this.music.setVolume(Number(el.volume.value) / 100);
        this.syncVolume();
        this.syncMute();
      };
    }

    const sync = () => this.syncLabels();
    for (const input of [el.size, el.cont, el.land, el.nations]) input.oninput = sync;
    // Enter tohum alanında dünyayı kurar: kaydırıcılara dokunmayan oyuncu
    // düğmeyi aramak zorunda kalmasın.
    el.seed.onkeydown = (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        this.build();
      }
    };
    // Alt görünümdeyken Esc ana listeye döner; menünün kendisinde kapatacak
    // bir şey yok.
    el.root.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && this.view !== 'actions') {
        event.preventDefault();
        this.showView('actions');
      }
    });
    this.syncLabels();
  }

  syncLabels() {
    const { el } = this;
    const cols = Number(el.size.value);
    el.sizeLabel.textContent = `${cols} × ${worldRows(cols)}`;
    el.contLabel.textContent = Number(el.cont.value).toFixed(2);
    el.landLabel.textContent = Number(el.land.value).toFixed(2);
    const nations = Number(el.nations.value);
    el.nationsLabel.textContent = nations > 0 ? String(nations) : 'automatic';
  }

  /** Sessiz düğmesinin görünümü tek yerden yazılır; durum müzikte tutulur. */
  syncMute() {
    const { mute } = this.el;
    if (!mute) return;
    const muted = this.music.muted;
    mute.classList.toggle('is-muted', muted);
    mute.setAttribute('aria-pressed', muted ? 'true' : 'false');
    mute.setAttribute('aria-label', muted ? 'Unmute menu music' : 'Mute menu music');
    mute.title = muted ? 'Music off' : `Music: ${this.music.trackTitle}`;
  }

  syncVolume() {
    const { volume, volumeLabel, creditsMusic } = this.el;
    const level = Math.round(this.music.level * 100);
    if (volume && Number(volume.value) !== level) volume.value = String(level);
    if (volumeLabel) volumeLabel.textContent = this.music.muted ? 'off' : `${level}%`;
    if (creditsMusic) creditsMusic.textContent = `Menu music: ${this.music.trackList}.`;
  }

  /** Hareket azaltma açıksa oyuncu bunu bilsin: sis ve geçişler durur. */
  syncMotionNote() {
    const { motionNote } = this.el;
    if (!motionNote) return;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    motionNote.textContent = reduced
      ? 'Reduced motion is on in your system settings — drifting fog and scene transitions are held still.'
      : 'Drifting fog and scene transitions follow your system’s reduced-motion setting.';
  }

  /** Kaydırıcılardaki değerlerle yeni dünya kurar ve perdeyi kaldırır. */
  build() {
    const { el } = this;
    const cols = Number(el.size.value);
    const nations = Number(el.nations.value);
    this.game.newWorld(el.seed.value.trim() || undefined, {
      cols,
      rows: worldRows(cols),
      continentality: Number(el.cont.value),
      landBias: Number(el.land.value),
      nationCount: nations > 0 ? nations : null,
    });
    this.close();
  }

  /**
   * Diskteki kaydı yükler. "Continue"dan farkı: bu, oturumdaki oyunu bırakıp
   * kayıttan okur — menüye oyun içinden dönülmüşse ikisi ayrı şeydir.
   */
  loadSave() {
    if (!this.game.load()) {
      this.el.loadNote.textContent = 'no compatible save found';
      return;
    }
    this.resumable = true;
    this.close();
  }

  /**
   * Tarayıcı oyunu kendini kapatamaz: `window.close()` yalnız script'in açtığı
   * sekmede çalışır. Denenir, olmazsa oyuncuya ne yapacağı söylenir.
   */
  exit() {
    window.close();
    this.el.exit.querySelector('small').textContent = 'close the tab to leave';
  }

  /**
   * Görünüm değiştirir. Ana listede çekmece kapalıdır; diğerlerinde çekmece
   * şeridin YANINDAN açılır ve şerit açık kalır — nereden geldiğin görünür.
   */
  showView(view) {
    this.view = view;
    const { el } = this;
    const titles = { setup: 'New Campaign', options: 'Settings', credits: 'Credits' };
    el.setup.classList.toggle('hidden', view !== 'setup');
    el.options.classList.toggle('hidden', view !== 'options');
    el.creditsView.classList.toggle('hidden', view !== 'credits');
    el.drawer.classList.toggle('hidden', view === 'actions');
    el.root.classList.toggle('drawer-open', view !== 'actions');
    if (titles[view]) el.drawerTitle.textContent = titles[view];
    // Şeritte hangi satırdan gelindiği işaretli kalır.
    const owner = { setup: el.create, options: el.settings, credits: el.credits }[view];
    for (const item of [el.create, el.settings, el.credits]) {
      item.classList.toggle('is-active', item === owner);
    }
    if (view === 'setup') el.seed.focus();
    else if (view === 'actions') el.cta.focus();
    if (view === 'options') { this.syncVolume(); this.syncMotionNote(); }
  }

  open() {
    this.open_ = true;
    // Düğme ancak işe yarıyorsa görünür: "Continue" oturumdaki oyunu sürdürür,
    // "Load Game" diskte kayıt varsa okur.
    const info = savedInfo();
    this.el.resume.hidden = !this.resumable;
    this.el.resumeNote.textContent = this.resumable ? saveLabel(info) : '';
    this.el.load.hidden = !info;
    this.el.loadNote.textContent = info ? saveLabel(info) : '';
    // Alt şeritteki tek birincil eylem duruma göre ad değiştirir.
    this.el.ctaLabel.textContent = this.resumable ? 'Continue Campaign' : 'Begin Campaign';
    this.el.ctaNote.textContent = this.resumable
      ? saveLabel(info)
      : 'a fresh world at the standard size';

    this.el.root.classList.remove('hidden');
    this.el.root.setAttribute('aria-hidden', 'false');
    document.body.classList.add('menu-open');
    this.showView('actions');
    this.el.cta.focus();
    this.music.start();
    this.syncMute();
    this.syncVolume();
  }

  close() {
    if (!this.open_) return;
    this.open_ = false;
    this.el.root.classList.add('hidden');
    this.el.root.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('menu-open');
    // Kampanya başlıyor: menü müziği perdeyle birlikte söner.
    this.music.stop();
    // Perde kalkarken harita ölçüsü değişmiş olabilir: menü açıkken gelen
    // resize olayları haritaya ulaşmıyordu.
    this.game.renderer.resize();
    this.game.requestRender();
  }

  /** Menüyü tekrar açar: oyun içi ayarlar panelindeki "Ana Menü" düğmesi. */
  reopen() {
    this.resumable = true;
    // Her dönüşte yeni sahne: menü aynı resimle donuk kalmasın.
    this.setScene(nextSceneIndex());
    this.open();
  }
}
