// Ana menü: oyunun açılış perdesi.
//
// Fon, depoya konmuş tek görsel varlıktır (assets/menu/main-menu.png). Projenin
// geri kalanı dokularını çalışma anında üretir (bkz. render/textures.js); bu
// dosya o kuralın bilinçli istisnasıdır — mat resim oyuncunun gördüğü ilk şey
// ve elle yapılmış bir kompozisyon.
//
// Menüde olmayan özelliğin düğmesi yoktur: "Devam Et" ancak kayıt varsa çıkar,
// dünya kurma alanları da ayarlar panelindeki üretim seçeneklerinin aynısıdır.
//
// Katman notu: DOM'a dokunur, oyun durumunu yalnız `game` üzerinden değiştirir.

import { savedInfo } from '../game/save.js';
import { gameDate } from './hud.js';

/**
 * Açılış sahneleri. Her uygulama açılışında sıradaki gelir.
 *
 * Kırpma noktası ve ton düzeltmesi sahneye özeldir: üç resmin en boy oranı ve
 * ışığı farklı, tek bir ayar üçünde birden tutmuyor. Ortak kural şu — metin
 * sütunu solda durur, o yüzden her sahnenin sol yarısı koyu kalmalı ve parlak
 * odak sağa düşmeli (perdeyi bkz. .menu-scrim).
 */
const SCENES = [
  {
    src: 'assets/menu/main-menu.png',
    // Yanan kıyı şeridi resmin üst üçte birinde; merkezden kırpınca kesiliyor.
    position: '50% 42%',
    filter: 'saturate(0.88) contrast(1.04) brightness(0.94)',
    tagline: 'A coastline under the guns, an empire behind them.',
  },
  {
    src: 'assets/menu/palace-hall.png',
    // Işık huzmeleri ve zemin yansıması alt yarıda; biraz aşağı bakılır.
    position: '50% 54%',
    // Zaten koyu ve çok mavi: kısmak yerine hafif ısıtılır.
    filter: 'saturate(0.78) contrast(1.06) brightness(1.02)',
    tagline: 'Empires are lost in quiet halls long before they are lost at sea.',
  },
  {
    src: 'assets/menu/field-road.png',
    // Ufuk çizgisi ortada; gökyüzü ile çamurlu yol birlikte kalsın.
    position: '50% 48%',
    // En soluk sahne; kontrast biraz açılır yoksa gri bir yüzey gibi duruyor.
    filter: 'saturate(0.9) contrast(1.12) brightness(0.92)',
    tagline: 'Roads decide campaigns long before the armies meet.',
  },
];

const SCENE_KEY = 'hexwar:menu-scene';

/**
 * Sıradaki sahne. Sayaç depolamada tutulur — "sırayla" oturum içinde değil,
 * açılıştan açılışa ilerler. Depolama kapalıysa (gizli sekme) ilk sahneye
 * düşer; menü resimsiz kalmaz.
 */
function nextScene() {
  let index = 0;
  try {
    index = (Number(localStorage.getItem(SCENE_KEY)) || 0) % SCENES.length;
    localStorage.setItem(SCENE_KEY, String((index + 1) % SCENES.length));
  } catch (err) {
    index = 0;
  }
  return SCENES[index] ?? SCENES[0];
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

    const $ = (id) => document.getElementById(id);
    this.el = {
      root: $('menu'),
      art: $('menu-art'),
      tagline: $('menu-tagline'),
      resume: $('menu-resume'),
      resumeNote: $('menu-resume-note'),
      create: $('menu-create'),
      random: $('menu-random'),
      setup: $('menu-setup'),
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
    };

    // Sahne yapıcıda seçilir: menü açıldığında resim çoktan yüklenmeye
    // başlamış olsun, perde boş bir kare göstermesin.
    this.setScene(nextScene());
    this.bind();
  }

  setScene(scene) {
    const { art, tagline } = this.el;
    if (!art || !scene) return;
    // index.html ilk sahneyi taşır; aynı kaynağa yeniden atamak yükleme
    // başlatmaz, farklıysa tarayıcı hemen indirmeye başlar.
    if (!art.src.endsWith(scene.src)) art.src = scene.src;
    art.style.objectPosition = scene.position;
    art.style.filter = scene.filter;
    // Metin sahneye bağlı: tek bir cümle üç resmin üçünde birden durmuyor.
    if (tagline && scene.tagline) tagline.textContent = scene.tagline;
  }

  bind() {
    const { el } = this;

    el.resume.onclick = () => this.close();
    el.random.onclick = () => {
      this.game.newWorld();
      this.close();
    };
    el.create.onclick = () => this.showSetup(true);
    el.back.onclick = () => this.showSetup(false);
    el.build.onclick = () => this.build();

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
    // Kurulum açıkken Esc geri alır; menünün kendisinde kapatacak bir şey yok.
    el.root.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !el.setup.classList.contains('hidden')) {
        event.preventDefault();
        this.showSetup(false);
      }
    });
    this.syncLabels();
  }

  syncLabels() {
    const { el } = this;
    const cols = Number(el.size.value);
    el.sizeLabel.textContent = `${cols} × ${Math.round(cols * 0.8)}`;
    el.contLabel.textContent = Number(el.cont.value).toFixed(2);
    el.landLabel.textContent = Number(el.land.value).toFixed(2);
    const nations = Number(el.nations.value);
    el.nationsLabel.textContent = nations > 0 ? String(nations) : 'automatic';
  }

  /** Kaydırıcılardaki değerlerle yeni dünya kurar ve perdeyi kaldırır. */
  build() {
    const { el } = this;
    const cols = Number(el.size.value);
    const nations = Number(el.nations.value);
    this.game.newWorld(el.seed.value.trim() || undefined, {
      cols,
      rows: Math.round(cols * 0.8),
      continentality: Number(el.cont.value),
      landBias: Number(el.land.value),
      nationCount: nations > 0 ? nations : null,
    });
    this.close();
  }

  showSetup(on) {
    this.el.setup.classList.toggle('hidden', !on);
    this.el.root.classList.toggle('setup-open', on);
    if (on) this.el.seed.focus();
    else this.el.create.focus();
  }

  open() {
    this.open_ = true;
    // "Devam Et" yalnız gerçekten devam edilecek bir oyun varsa görünür.
    this.el.resume.hidden = !this.resumable;
    this.el.resumeNote.textContent = this.resumable ? saveLabel(savedInfo()) : '';

    this.el.root.classList.remove('hidden');
    this.el.root.setAttribute('aria-hidden', 'false');
    document.body.classList.add('menu-open');
    this.showSetup(false);
    (this.resumable ? this.el.resume : this.el.create).focus();
  }

  close() {
    if (!this.open_) return;
    this.open_ = false;
    this.el.root.classList.add('hidden');
    this.el.root.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('menu-open');
    // Perde kalkarken harita ölçüsü değişmiş olabilir: menü açıkken gelen
    // resize olayları haritaya ulaşmıyordu.
    this.game.renderer.resize();
    this.game.requestRender();
  }

  /** Menüyü tekrar açar: oyun içi ayarlar panelindeki "Ana Menü" düğmesi. */
  reopen() {
    this.resumable = true;
    this.open();
  }
}
