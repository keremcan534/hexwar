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
// Perde durgun bir fotoğraftır (canlı katman ve sis 2026-11-15'te kalktı);
// üstünde yalnız müzik çalar (bkz. menuMusic.js).
//
// Menüde olmayan özelliğin düğmesi yoktur: "Continue" ancak oturumda yüklü
// oyun varsa, "Load Game" ancak diskte kayıt varsa çıkar.
//
// Katman notu: DOM'a dokunur, oyun durumunu yalnız `game` üzerinden değiştirir.

import {
  SAVE_VERSION, exportSaveText, importSaveText, savedInfo,
} from '../game/save.js';
import { campaignSaveState, gameDate } from './hud.js';
import { worldRows } from '../world/worldgen.js';
import { MenuMusic } from './menuMusic.js';
import { END_YEAR, ERA_NAME, START_YEAR } from '../game/calendar.js';
import { randomSeed } from '../core/rng.js';
import { flagDataUrl } from '../render/flagPainter.js';
import { nationRoster } from '../game/nationBrief.js';

/**
 * Oyunun adı. Menüde tek yerden yazılır; başlığı değiştirmek için markup'a
 * ya da CSS'e dokunmak gerekmez.
 */
export const GAME_TITLE = 'Imperial Eye';
export const GAME_EYEBROW = `${ERA_NAME} · ${START_YEAR} – ${END_YEAR}`;

/**
 * Önizleme haritasının en-boy oranı: hex sütunu √3, satırı 1.5 birim.
 * 160 × 96'lık dünya 1.92:1'lik bir dikdörtgendir, 5:3 değil.
 */
const hexAspect = (cols, rows) => (cols * Math.sqrt(3)) / (rows * 1.5);
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
 * Resimler JPEG: fon fotoğrafı PNG olarak 2,4 MB tutuyordu ve menü on sahne
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
    src: 'assets/menu/valley-town.jpg',
    // Kasaba ve gölcükler ufkun hemen altında; güneş yarığı sol üstte.
    position: '50% 45%',
    filter: 'saturate(0.85) contrast(1.08) brightness(0.96)',
    theme: 'valley',
    label: 'Valley Town',
    tagline: 'Every province on the map is somebody’s whole world.',
  },
  {
    src: 'assets/menu/burning-street.jpg',
    // Alevler sol üstte, sokak sağa kaçıyor; merkez dumanlı ve sakin.
    position: '50% 40%',
    filter: 'saturate(0.86) contrast(1.06) brightness(0.92)',
    theme: 'burning-street',
    label: 'Burning Street',
    tagline: 'Wars are declared in palaces and paid for in streets like this.',
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

const MOTION_KEY = 'hexwar.motion';

/**
 * Arayuz animasyonlari (styles.css §31). Sistemin "hareketi azalt" ayarina
 * BAGLI DEGIL: Kerem'in Windows'unda animasyon efektleri kapali ve tarayici
 * bunu "reduce" diye bildiriyor; animasyon isteyen oyuncu onlari hic
 * goremiyordu. Varsayilan acik, secim tarayicida kalir.
 */
export function uiMotion() {
  try {
    return localStorage.getItem(MOTION_KEY) === 'off' ? 'off' : 'on';
  } catch {
    return 'on';
  }
}

export function setUiMotion(value) {
  const next = value === 'off' ? 'off' : 'on';
  document.documentElement.dataset.motion = next;
  try {
    localStorage.setItem(MOTION_KEY, next);
  } catch {
    // Depo kapaliysa tercih yalniz bu oturumda yasar.
  }
}

// Modul yuklenirken uygulanir: menu acilmadan once de gecerli olsun.
document.documentElement.dataset.motion = uiMotion();

/** Kayıt künyesi: "seed 4KZQ81 · 14 MAR 1851". */
function saveLabel(info) {
  if (!info) return '';
  const parts = [];
  if (info.seed) parts.push(`seed ${info.seed}`);
  if (info.turn) parts.push(gameDate(info.turn, info.day ?? 0));
  return parts.join(' · ');
}

/**
 * "Continue"un sürdüreceği şey BELLEKTEKİ oturumdur, diskteki kayıt değil.
 * Künye eskiden diski okuyordu: yeni dünya kurup menüye dönen oyuncu
 * "Continue · seed A · 20 MAY" görüp tıklıyor, B dünyasının 1 JAN'ına
 * dönüyordu — ve on hafta sonra otomatik kayıt tek yuvadaki A'yı eziyordu.
 * Tarih HUD'la aynı: tur tabanı + saatin günü.
 */
function sessionLabel(game) {
  const world = game.world;
  if (!world) return '';
  return saveLabel({ seed: world.seed, turn: game.turns?.turn, day: game.clock?.day });
}

export class MainMenu {
  /**
   * @param {object} game
   * @param {{ resumable?: boolean }} options `resumable` açılışta kaydın
   *   gerçekten yüklendiğini söyler; menü kapanınca oyun oradan devam eder.
   */
  constructor(game, { resumable = false, onWorldBuilt = null, onOpen = null } = {}) {
    this.game = game;
    this.resumable = resumable;
    // Yeni dunya kurulunca perde kalkar ve ulke secimi acilir (main.js).
    this.onWorldBuilt = onWorldBuilt;
    this.onOpen = onOpen;
    this.open_ = false;
    this.sceneIndex = 0;

    const $ = (id) => document.getElementById(id);
    this.el = {
      root: $('menu'),
      art: $('menu-art'),
      live: $('menu-live'),
      title: $('menu-title'),
      eyebrow: document.querySelector('.mm-eyebrow'),
      tagline: $('menu-tagline'),
      sceneLabel: $('menu-scene-label'),
      sceneCount: $('menu-scene-count'),
      scenePrev: $('menu-scene-prev'),
      ctaFlag: $('menu-cta-flag'),
      ctaKicker: $('menu-cta-kicker'),
      track: $('menu-track'),
      dice: $('menu-dice'),
      preview: $('menu-preview'),
      previewBox: $('menu-preview-box'),
      previewStatus: $('menu-preview-status'),
      previewSeed: $('menu-preview-seed'),
      previewStats: $('menu-preview-stats'),
      presets: [...document.querySelectorAll('#menu .mm-seg[data-preset]')],
      nav: $('menu-rail'),
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
      motionChoices: [...document.querySelectorAll('[data-motion-choice]')],
      exportSave: $('menu-export'),
      importSave: $('menu-import'),
      importFile: $('menu-import-file'),
      saveNote: $('menu-save-note'),
      mute: $('menu-mute'),
      sceneBtn: $('menu-scene'),
      buildInfo: $('menu-build-info'),
    };

    this.music = new MenuMusic();
    // Arka plan yalnız fotoğraftır (Kerem 2026-11-15: "animasyonlu arka plan
    // istemiyorum"): canlı katman (menuMotion.js) artık kurulmaz.
    this.motion = null;

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
    this.motion?.setScene(scene);
    if (tagline && scene.tagline) tagline.textContent = scene.tagline;
    // Müze künyesi: sahnenin adı ve sırası.
    if (this.el.sceneLabel) this.el.sceneLabel.textContent = scene.label;
    if (this.el.sceneCount) this.el.sceneCount.textContent = `${this.sceneIndex + 1} / ${SCENES.length}`;
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

    el.resume.onclick = () => this.resume();
    el.random.onclick = () => {
      if (!this.confirmDiscard(el.random, 'random')) return;
      this.game.newWorld();
      this.close();
      this.onWorldBuilt?.();
    };
    el.create.onclick = () => this.showView('setup');
    el.settings.onclick = () => this.showView('options');
    el.credits.onclick = () => this.showView('credits');
    el.back.onclick = () => this.showView('actions');
    el.drawerClose.onclick = () => this.showView('actions');
    // Birincil eylem: kayıt varsa kampanyayı sürdürür, yoksa yeni dünya kurar.
    el.cta.onclick = () => {
      const fresh = !this.resumable;
      if (!fresh) {
        this.resume();
        return;
      }
      this.game.newWorld();
      this.close();
      this.onWorldBuilt?.();
    };
    el.build.onclick = () => this.build();
    el.load.onclick = () => {
      if (!this.confirmDiscard(el.load, 'load')) return;
      this.loadSave();
    };
    el.exit.onclick = () => this.exit();
    for (const chip of el.motionChoices ?? []) {
      chip.onclick = () => {
        setUiMotion(chip.dataset.motionChoice);
        this.syncMotionNote();
        this.motion?.sync();
      };
    }
    if (el.exportSave) el.exportSave.onclick = () => this.exportSave();
    if (el.importSave && el.importFile) {
      el.importSave.onclick = () => el.importFile.click();
      el.importFile.onchange = () => this.importSave(el.importFile.files?.[0]);
    }
    for (const button of el.root.querySelectorAll('[data-menu-back]')) {
      button.onclick = () => this.showView('actions');
    }

    if (el.mute) {
      el.mute.onclick = () => {
        this.music.toggleMute();
        this.syncMute();
        // Ayarlardaki ses etiketi de "off" demeli; yalnız kaydırıcı onu tazeliyordu.
        this.syncVolume();
      };
    }
    // Sahne düğmesi: bir sonraki sahneye geçer. Temayı denemek için ayarlara
    // girmek gerekmesin.
    if (el.sceneBtn) el.sceneBtn.onclick = () => this.setScene(this.sceneIndex + 1);
    if (el.scenePrev) el.scenePrev.onclick = () => this.setScene(this.sceneIndex - 1);

    // KURULUM: adlandırılmış seçenekler kaydırıcıları yazar (kaydırıcılar
    // "Fine tune" altında, değerin tek kaynağı onlardır). Her değişiklik
    // önizlemeyi yeniden ister; önizleme işçide koşar, menü donmaz.
    for (const seg of el.presets) {
      const input = { size: el.size, cont: el.cont, land: el.land, nations: el.nations }[seg.dataset.preset];
      for (const button of seg.querySelectorAll('button[data-value]')) {
        button.onclick = () => {
          input.value = button.dataset.value;
          this.syncLabels();
          this.schedulePreview(0);
        };
      }
    }
    if (el.dice) {
      el.dice.onclick = () => {
        el.seed.value = randomSeed();
        this.schedulePreview(0);
      };
    }
    el.seed.addEventListener('input', () => this.schedulePreview());
    if (el.volume) {
      el.volume.oninput = () => {
        this.music.setVolume(Number(el.volume.value) / 100);
        this.syncVolume();
        this.syncMute();
      };
    }

    const sync = () => { this.syncLabels(); this.schedulePreview(); };
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
    // bir şey yok. Dinleyici belgededir: menü kökünde dururken arka plana
    // (sahne resmine) bir tık odağı <body>'ye düşürüyor, Esc menüye hiç
    // ulaşmıyor ve çekmece açık kalıyordu (ölçüldü).
    document.addEventListener('keydown', (event) => {
      if (!this.open_) return;
      if (event.key === 'Escape' && this.view !== 'actions') {
        event.preventDefault();
        this.showView('actions');
        return;
      }
      // Ana listede ↑↓ kart ve satırlar arasında gezer (Enter düğmenin işi).
      if (this.view === 'actions' && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
        const stops = [el.cta, ...el.nav.querySelectorAll('.mm-item')]
          .filter((b) => !b.hidden && b.offsetParent !== null);
        const at = stops.indexOf(document.activeElement);
        const next = event.key === 'ArrowDown' ? (at + 1) % stops.length : (at - 1 + stops.length) % stops.length;
        stops[at < 0 ? 0 : next]?.focus();
        event.preventDefault();
        return;
      }
      // Kurulumda Enter dünyayı kurar (bir düğmenin ya da metin alanının
      // üstünde değilse: oradaki Enter o öğenindir).
      if (this.view === 'setup' && event.key === 'Enter' && !event.repeat
        && !event.target.closest?.('button, summary, input[type="range"]')) {
        event.preventDefault();
        this.build();
      }
    });
    this.syncLabels();
  }

  /** Kurulumdaki tohum: alan boşsa açılışta çekilen rastgele tohum. */
  currentSeed() {
    return this.el.seed.value.trim() || this.pendingSeed || (this.pendingSeed = randomSeed());
  }

  currentOptions() {
    const { el } = this;
    const cols = Number(el.size.value);
    return {
      cols,
      rows: worldRows(cols),
      continentality: Number(el.cont.value),
      landBias: Number(el.land.value),
    };
  }

  /** Seçili seçenek düğmeleri kaydırıcının değerinden okunur (tek kaynak). */
  syncPresets() {
    const { el } = this;
    const value = { size: el.size, cont: el.cont, land: el.land, nations: el.nations };
    for (const seg of el.presets) {
      const now = Number(value[seg.dataset.preset].value);
      for (const button of seg.querySelectorAll('button[data-value]')) {
        const on = Math.abs(Number(button.dataset.value) - now) < 1e-6;
        button.classList.toggle('on', on);
        button.setAttribute('aria-pressed', on ? 'true' : 'false');
      }
    }
  }

  /**
   * CANLI ÖNİZLEME. Dünya işçide üretilir (ui/menuPreviewWorker.js); iş
   * sürerken yeni bir istek gelirse eski işçi kapatılır — 2 sn'lik eski bir
   * dünyanın bitmesini beklemek, sürgüyü çeken oyuncuya geç cevap demekti.
   */
  schedulePreview(delay = 380) {
    if (this.view !== 'setup') return;
    clearTimeout(this.previewTimer);
    this.previewTimer = setTimeout(() => this.runPreview(), delay);
  }

  runPreview() {
    const { el } = this;
    if (!el.preview || this.view !== 'setup') return;
    const seed = this.currentSeed();
    const options = this.currentOptions();
    const id = (this.previewId = (this.previewId ?? 0) + 1);
    if (this.previewBusy && this.previewWorker) {
      this.previewWorker.terminate();
      this.previewWorker = null;
    }
    if (!this.previewWorker) {
      try {
        this.previewWorker = new Worker(new URL('./menuPreviewWorker.js', import.meta.url), { type: 'module' });
      } catch {
        el.previewStatus.textContent = 'Preview unavailable';
        return;
      }
      this.previewWorker.onmessage = (event) => this.drawPreview(event.data);
      this.previewWorker.onerror = () => {
        this.previewBusy = false;
        el.previewBox.classList.remove('is-busy');
        el.previewStatus.textContent = 'Preview unavailable';
      };
    }
    this.previewBusy = true;
    el.previewBox.classList.add('is-busy');
    el.previewStatus.textContent = 'Generating';
    el.previewSeed.textContent = `seed ${seed}`;
    el.previewStats.textContent = `${options.cols} × ${options.rows}`;
    this.previewWorker.postMessage({ id, seed, options });
  }

  drawPreview(data) {
    if (data.id !== this.previewId) return;
    const { el } = this;
    this.previewBusy = false;
    el.previewBox.classList.remove('is-busy');
    if (data.error) {
      el.previewStatus.textContent = 'Preview unavailable';
      return;
    }
    const { cols, rows, pixels } = data;
    // Kareler gerçek altıgen çizilir (tek satırlar yarım hex sağa: oyunun
    // "odd-r" düzeni). Kare başına bir pikseli büyütmek basamaklı, bulanık
    // bir resim veriyordu; böyle önizleme haritanın kendisinin minyatürüdür.
    const canvas = el.preview;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cssW = Math.max(1, Math.round(canvas.getBoundingClientRect().width));
    const W = Math.round(cssW * dpr);
    const hexW = W / (cols + 0.5);
    const hexH = (hexW * 2) / Math.sqrt(3);
    const H = Math.round(hexH * (0.75 * rows + 0.25));
    canvas.width = W;
    canvas.height = H;
    canvas.style.aspectRatio = `${hexAspect(cols, rows)}`;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#0b2430';
    ctx.fillRect(0, 0, W, H);
    // Komşu altıgenler arasında saç teli boşluk kalmasın: yarım piksel taşma.
    const hw = hexW / 2 + 0.35;
    const q = hexH / 4 + 0.25;
    for (let r = 0; r < rows; r++) {
      const y = hexH / 2 + r * hexH * 0.75;
      const shift = r & 1 ? hexW / 2 : 0;
      for (let c = 0; c < cols; c++) {
        const i = (r * cols + c) * 4;
        const x = hexW / 2 + c * hexW + shift;
        ctx.fillStyle = `rgb(${pixels[i]},${pixels[i + 1]},${pixels[i + 2]})`;
        ctx.beginPath();
        ctx.moveTo(x, y - 2 * q);
        ctx.lineTo(x + hw, y - q);
        ctx.lineTo(x + hw, y + q);
        ctx.lineTo(x, y + 2 * q);
        ctx.lineTo(x - hw, y + q);
        ctx.lineTo(x - hw, y - q);
        ctx.closePath();
        ctx.fill();
      }
    }
    // Atlas levhası: kenarlara doğru hafif karartma.
    const vignette = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.62);
    vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
    vignette.addColorStop(1, 'rgba(0, 0, 0, 0.38)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, W, H);
    el.previewStatus.textContent = '';
    el.previewStats.textContent = `${cols} × ${rows} · ${Math.round(data.land * 100)}% land`;
    canvas.classList.remove('is-fresh');
    void canvas.offsetWidth;
    canvas.classList.add('is-fresh');
  }

  stopPreview() {
    clearTimeout(this.previewTimer);
    this.previewWorker?.terminate();
    this.previewWorker = null;
    this.previewBusy = false;
  }

  /**
   * Birincil kart: kampanya varsa onun kimliği (dalgalanan bayrak, ulus,
   * tarih, sıra), yoksa yeni kampanya. Eski "Continue Campaign · seed X"
   * düğmesi oyuncuya neye döneceğini söylemiyordu.
   */
  syncCta() {
    const { el, game } = this;
    const nation = this.resumable ? game.world?.nations?.[game.turns?.playerNation] : null;
    el.cta.classList.toggle('is-campaign', Boolean(nation));
    if (nation) {
      const roster = nationRoster(game.world);
      const row = roster.find((r) => r.id === nation.id);
      el.ctaKicker.textContent = 'Continue campaign';
      el.ctaLabel.textContent = nation.fullName ?? nation.name;
      el.ctaNote.textContent = [sessionLabel(game).split(' · ').pop(), row ? `rank ${row.rank} of ${roster.length}` : '']
        .filter(Boolean).join(' · ');
      // Durgun bayrak (2× çözünürlük, 54×36 gösterim): dalgalanan bez kartın
      // tek hareketli öğesi oluyordu, menü artık durgun.
      el.ctaFlag.innerHTML = `<img src="${flagDataUrl(nation, 108, 72)}" alt="" draggable="false">`;
    } else {
      el.ctaKicker.textContent = 'New campaign';
      el.ctaLabel.textContent = 'Begin Campaign';
      el.ctaNote.textContent = '';
      el.ctaFlag.textContent = '';
    }
  }

  syncLabels() {
    const { el } = this;
    const cols = Number(el.size.value);
    el.sizeLabel.textContent = `${cols} × ${worldRows(cols)}`;
    el.contLabel.textContent = Number(el.cont.value).toFixed(2);
    el.landLabel.textContent = Number(el.land.value).toFixed(2);
    const nations = Number(el.nations.value);
    el.nationsLabel.textContent = nations > 0 ? String(nations) : 'automatic';
    this.syncPresets();
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
    // Çalan parçanın adı sütunun altında: müzik bir kayıt gibi anılır.
    if (this.el.track) this.el.track.textContent = muted ? 'Music off' : (this.music.trackTitle ?? '');
  }

  syncVolume() {
    const { volume, volumeLabel, creditsMusic } = this.el;
    const level = Math.round(this.music.level * 100);
    if (volume && Number(volume.value) !== level) volume.value = String(level);
    if (volumeLabel) volumeLabel.textContent = this.music.muted ? 'off' : `${level}%`;
    if (creditsMusic) creditsMusic.textContent = `Menu music: ${this.music.trackList}.`;
  }

  /**
   * Anahtar TEK kaynaktır: sis, sahne geçişi, bayrak dalgası ve arayüz
   * hareketleri. Sistemin "hareketi azalt" bayrağı yalnız bilgi olarak anılır —
   * ona bağlı hareket Kerem'in makinesinde hiç oynamıyordu.
   */
  syncMotionNote() {
    const { motionNote } = this.el;
    for (const chip of this.el.motionChoices ?? []) {
      chip.setAttribute('aria-pressed', chip.dataset.motionChoice === uiMotion() ? 'true' : 'false');
    }
    if (!motionNote) return;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    motionNote.textContent = uiMotion() === 'off'
      ? 'Everything holds still: scenes, fog, flags, panels and screen transitions.'
      : reduced
        ? 'Your system asks for reduced motion; the game still animates because this switch is on.'
        : 'Scenes come alive, flags wave, and panels slide as they open and close.';
  }

  /**
   * Oturumdaki kampanyayı atan eylemin onayı. Oyun içinden açılan menüde
   * "Random World", "Generate World" ve "Load Game" tek tıkla süren
   * kampanyayı siliyordu; kayıt ekranı aynı işi iki tıkla yapıyor (B-05).
   * Kaybedilecek bir şey yoksa (kayıtlı, ya da hiç oynanmamış dünya) onay
   * istenmez. İlk tık düğmenin notunu uyarıya çevirir; 8 sn sonra söner.
   * @returns {boolean} eylem şimdi yapılsın mı
   */
  confirmDiscard(button, key) {
    if (!this.resumable) return true;
    const state = campaignSaveState(this.game);
    if (!state.unsaved) return true;
    if (this.discardArmed === key) {
      this.disarmDiscard();
      return true;
    }
    this.disarmDiscard();
    this.discardArmed = key;
    // Şerit düğmesinin notu uyarıya döner; notu olmayan düğme (Generate
    // World) kendi yazısını değiştirir.
    const note = button.querySelector('small') ?? button;
    this.discardNote = { button, note, text: note.textContent, title: button.title };
    button.classList.add('is-confirming');
    note.textContent = note === button
      ? 'Click again to abandon this campaign'
      : `click again to abandon this campaign · ${state.note}`;
    button.title = state.note;
    this.discardTimer = setTimeout(() => this.disarmDiscard(), 8000);
    return false;
  }

  disarmDiscard() {
    clearTimeout(this.discardTimer);
    this.discardArmed = null;
    const armed = this.discardNote;
    this.discardNote = null;
    if (!armed) return;
    armed.button.classList.remove('is-confirming');
    armed.note.textContent = armed.text;
    armed.button.title = armed.title;
  }

  /** Kaydırıcılardaki değerlerle yeni dünya kurar ve perdeyi kaldırır. */
  build() {
    const { el } = this;
    if (!this.confirmDiscard(el.build, 'build')) return;
    const nations = Number(el.nations.value);
    // Önizlenen dünya kurulur: alan boşken çekilen rastgele tohum da aynıdır.
    const seed = this.currentSeed();
    this.pendingSeed = null;
    this.stopPreview();
    this.game.newWorld(seed, {
      ...this.currentOptions(),
      nationCount: nations > 0 ? nations : null,
    });
    this.close();
    this.onWorldBuilt?.();
  }

  /**
   * Diskteki kaydı yükler. "Continue"dan farkı: bu, oturumdaki oyunu bırakıp
   * kayıttan okur — menüye oyun içinden dönülmüşse ikisi ayrı şeydir.
   */
  async loadSave() {
    // Kayıtlar artık yuvalarda (IndexedDB, zaman uyumsuz); en yenisi yüklenir.
    // Ret nedeni yazılır: "no compatible save" sürüm farkını da, eksik veriyi
    // de aynı cümleyle geçiştiriyordu.
    const result = await this.game.load();
    if (!result.ok) {
      this.el.loadNote.textContent = result.reason;
      return;
    }
    this.resumable = true;
    this.close();
  }

  /**
   * Kaydı dosyaya indirir. Kayıt tarayıcı deposunda adres başına durduğu için
   * oyunu başka bir pencereden (başlatıcı) açan oyuncunun kampanyası ancak
   * böyle taşınır. Depodaki kayıt aynen iner; oturumdaki oyun burada
   * YAZILMAZ — aynı adreste iki pencere açıksa eski oturum yeni kaydı ezerdi.
   * Dosya adı kaydın tarihini taşır: ne indirildiği görünür.
   */
  async exportSave() {
    const text = await exportSaveText();
    if (!text) {
      this.el.saveNote.textContent = 'There is no saved campaign in this window yet.';
      return;
    }
    const info = savedInfo();
    const blob = new Blob([text], { type: 'application/json' });
    const link = document.createElement('a');
    const date = info?.turn ? gameDate(info.turn).replace(/\s+/g, '-').toLowerCase() : 'campaign';
    link.href = URL.createObjectURL(blob);
    link.download = `imperial-eye-${date}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    this.el.saveNote.textContent = `Exported ${saveLabel(info)}.`;
  }

  /** Dosyadaki kaydı depoya alır; doğrulanmayan dosya mevcut kaydı ezmez. */
  async importSave(file) {
    const { el } = this;
    if (!file) return;
    el.importFile.value = '';
    const result = await importSaveText(await file.text(), file.name.replace(/\.json$/i, ''));
    if (!result.ok) {
      el.saveNote.textContent = `Could not import: ${result.reason}.`;
      return;
    }
    el.saveNote.textContent = `Imported ${saveLabel(result.info)} — choose Load Game to play it.`;
    el.load.hidden = false;
    el.loadNote.textContent = saveLabel(result.info);
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
    if (view === 'setup') {
      // Alan boşken kurulacak dünyanın tohumu şimdiden çekilir ve yazılır:
      // önizleme ile "Generate World" aynı dünyayı gösterir.
      if (!this.pendingSeed) this.pendingSeed = randomSeed();
      el.seed.placeholder = this.pendingSeed;
      this.syncPresets();
      this.schedulePreview(0);
      el.seed.focus();
    } else {
      this.stopPreview();
      if (view === 'actions') el.cta.focus();
    }
    if (view === 'options') { this.syncVolume(); this.syncMotionNote(); }
  }

  open() {
    this.open_ = true;
    this.onOpen?.();
    this.disarmDiscard();
    // Perde inerken saat durur: menü açıkken haftalar kapanıyor, YZ oynuyor,
    // muharebeler bitiyordu ve "Continue · 22 JAN" notu çoktan eskimişti
    // (B-04). Continue eski hızı geri verir.
    const speed = this.game.clock?.speed ?? 0;
    if (speed > 0) {
      this.resumeSpeed = speed;
      this.game.setSpeed(0);
    }
    // Düğme ancak işe yarıyorsa görünür: "Continue" oturumdaki oyunu sürdürür,
    // "Load Game" diskte kayıt varsa okur.
    const info = savedInfo();
    const session = this.resumable ? sessionLabel(this.game) : '';
    this.el.resume.hidden = !this.resumable;
    this.el.resumeNote.textContent = session;
    this.el.load.hidden = !info;
    this.el.loadNote.textContent = info ? saveLabel(info) : '';
    // Birincil kart duruma göre: kampanyanın kimliği ya da yeni kampanya.
    this.syncCta();

    // Açılış sahnesi: kimlik, kart ve satırlar sırayla belirir (yalnız açılırken;
    // hareket kapalıysa CSS hiçbirini oynatmaz).
    this.el.root.classList.add('is-entering');
    clearTimeout(this.enterTimer);
    this.enterTimer = setTimeout(() => this.el.root.classList.remove('is-entering'), 2400);
    this.el.root.classList.remove('hidden');
    this.el.root.setAttribute('aria-hidden', 'false');
    document.body.classList.add('menu-open');
    this.showView('actions');
    this.el.cta.focus();
    this.music.start();
    this.motion?.start();
    this.syncMute();
    this.syncVolume();
  }

  /** "Continue": oturumdaki kampanyaya döner, menü açılırken akan saati geri verir. */
  resume() {
    const speed = this.resumeSpeed ?? 0;
    this.resumeSpeed = 0;
    this.close();
    if (speed > 0 && this.game.world && !this.game.turns?.victory) this.game.setSpeed(speed);
  }

  close() {
    if (!this.open_) return;
    this.open_ = false;
    this.disarmDiscard();
    this.stopPreview();
    // Başka bir yoldan çıkış (yeni dünya, yükleme) eski hızı taşımaz.
    if (this.resumeSpeed) this.resumeSpeed = 0;
    this.el.root.classList.add('hidden');
    this.el.root.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('menu-open');
    // Kampanya başlıyor: menü müziği perdeyle birlikte söner.
    this.music.stop();
    this.motion?.stop();
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
