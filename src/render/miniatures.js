// Birim minyatürleri: yakın zoomda sayacın yerini alan, Blender'da pişmiş figürler.
//
// Atlaslar (assets/minis, scripts/art/unit-minis.py) nötr gri üniformayla ışığı ve
// ayrı bir renk maskesini taşır. Elli ulus × tür × yön × kare önceden boyanamaz: bir kare
// ilk gerektiğinde ulus rengiyle sabit hücreli bir sayfaya basılır ve sonra tek
// drawImage'dır. Sayfa dolunca en eski hücre geri alınır.
//
// Bu katman simülasyonu okur ama yazmaz; görsel kayma ve yön hafızası burada tutulur.
// Kare temposu kendi rAF döngüsü DEĞİLDİR: renderer su kadansından tik ister (due/live).

import { HEX_SIZE } from '../world/worldgen.js';
import { maxHpOf, organizationOf } from '../game/units.js';
import { FONT_UI } from './fonts.js';
import { MINI_ATLAS } from './miniAtlas.js';
import { paintBars, paintFlagChip, paintLabel, paintPlaque, paintStackTab, unitSkinStamp } from './unitSkin.js';

/** Sayaçtan minyatüre geçiş bandı (zoom): altında sayaç, üstünde figür. */
export const MINI_ZOOM_IN = 1.15;
export const MINI_ZOOM_FULL = 1.55;
/**
 * Figür bu zooma kadar büyür, sonra ekranda sabit kalır (HOI4 ölçeği). 1.55'te durunca
 * figür ~45 px'e iniyor, atlasın 160 px'lik çiziminin yarısından azı kullanılıyor ve
 * bulanık okunuyordu; 2.2'de piyade hücresi ~125 px, çizim kendi çözünürlüğüne yakın.
 */
const MINI_ZOOM_HOLD = 2.2;
/** Atlas bu zoomdan itibaren inmeye başlar: geçiş bandına girildiğinde hazır olsun. */
const PRELOAD_ZOOM = 0.85;
/** Figür karesinin yenilenme aralığı; arada haritanın 2B katmanı boşta kalır. */
const TICK_MS = 66;
/** Kare başına en çok bu kadar yeni kare boyanır; ilk görünüşte tek karede yığılmasın. */
const BAKES_PER_FRAME = 10;
/** Boyamanın kare başına süre tavanı (ms): kalabalık sahnenin ilk turu takılmasın. */
const BAKE_BUDGET_MS = 1.2;
/** Sefer sırasında bir province'ten ötekine kayma süresi (ms). */
const GLIDE_MS = 1100;

/**
 * Yığın tek figürle görünür: beş küçük er yan yana cephede birbirine karışıyordu.
 * Küçük türler daha çok büyür, tank ile piyade ekranda yakın boyda okunur.
 */
const FIGURE_SCALE = { infantry: 1.9, cavalry: 1.5, artillery: 1.4, armor: 1.3 };
/** Yığında birden çok tür varsa görünen: en ağır kol. */
const KIND_ORDER = ['armor', 'artillery', 'cavalry', 'infantry'];

const FPS = { idle: 5, walk: 10, fire: 11 };
/** Muharebede tek figürün ateş döngüsü (sn): ateş kareleri + nişanda bekleme. */
const FIRE_PERIOD = 2.6;
/** Ateş döngüsünde alevin yandığı kareler ve parlaklıkları (Blender'daki FIRE_AT ile eş). */
const FLASH_POWER = { 1: 1, 2: 0.45 };

/** Oyun birim türü → atlas. Atlası olmayan tür (hava kanadı) sayaç olarak kalır. */
const KIND_OF = { INFANTRY: 'infantry', CAVALRY: 'cavalry', ARTILLERY: 'artillery', ARMOR: 'armor' };
const MINI_KINDS = ['infantry', 'cavalry', 'artillery', 'armor', 'warship', 'submarine', 'transport'];

const SQUASH = 0.72;
const HEADINGS = Array.from({ length: 8 }, (_, i) => [Math.cos(i * Math.PI / 4), Math.sin(i * Math.PI / 4)]);

/**
 * Figürün altındaki levha (CSS px): sayacın künyesiyle aynı malzeme (unitSkin.js). `m` gölge
 * ve yığın etiketinin taşma payıdır.
 */
const PLATE = { w: 64, h: 27, m: 5 };
/**
 * Seçim halkası (dünya birimi). baseShare halkanın figür boyuna oranı, bodyShare
 * gövdenin yarı eni (ad kutusu için), headShare ayaktan başa olan pay.
 */
const RING = { pad: 3, drop: 2, minRadius: 10, baseShare: 0.19, baseSquash: 0.5, bodyShare: 0.3, headShare: 0.82 };

/** Filo devriyesi: gemiler bölgenin derin noktası çevresinde ağır bir elips çizer. */
const PATROL = { rx: 40, ry: 21, step: 30, speed: 0.05, perNation: 3 };
const WAKE = { samples: 8, gap: 0.075, spread: 1.15 };

const byDepth = (a, b) => a.y - b.y;
const hash01 = (n) => (Math.imul(n | 0, 2654435761) >>> 0) / 4294967296;
const smoothstep = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** HSL → sRGB [0, 1]. */
function hslRgb(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] = hp < 1 ? [c, x, 0] : hp < 2 ? [x, c, 0] : hp < 3 ? [0, c, x]
    : hp < 4 ? [0, x, c] : hp < 5 ? [x, 0, c] : [c, 0, x];
  return [r + m, g + m, b + m];
}

/**
 * Ulus renginden kumaş boyası. Harita rengi doygun bir pankarttır; aynı ton üniformada
 * oyuncak gibi durur. Bu yüzden renk savaş yıllarının bitkisel boyalarına çekilir ve
 * parlaklık dar bir banda sıkışır: hem kumaş kalır hem uluslar birbirinden ayrılır.
 */
function clothTint(nation, base, share) {
  // Ton ülkenin, açıklık haritadan belirgin biçimde koyu: aynı renkteki ülke zemininde
  // açık ve doygun üniforma kayboluyordu (Kerem). Kontur ve kaide tarafı ayrıca söyler.
  const rgb = hslRgb(nation.hue ?? 0, Math.min(1, ((nation.sat ?? 50) / 100) * 1.2), Math.min(1, (nation.light ?? 50) / 100));
  const mixed = rgb.map((v, i) => v * (1 - share) + base[i] * share);
  const luma = mixed[0] * 0.3 + mixed[1] * 0.59 + mixed[2] * 0.11;
  const target = Math.max(0.26, Math.min(0.4, luma * 0.62));
  const gain = target / Math.max(0.05, luma);
  return `rgb(${mixed.map((v) => Math.round(Math.min(1, v * gain) * 255)).join(',')})`;
}
const FIELD_DRAB = [0.62, 0.6, 0.44];
const NAVAL_GREY = [0.66, 0.69, 0.72];

/**
 * Namlu parıltısı: namlu yönünde uzayan, düzensiz alev dilleri. Yuvarlak hale kullanılmaz;
 * radyal disk haritanın üstünde yapıştırılmış bir daire gibi okunuyordu. Her dil kendi
 * ucuna doğru sıfıra iner, görünür kenar kalmaz. Üç çeşit, atıştan atışa değişsin diye.
 */
const FLARE = { w: 256, h: 128, mouth: 16 };

function flareSprites() {
  let seed = 48271;
  const rnd = (a, b) => {
    seed = (seed * 16807) % 2147483647;
    return a + (seed / 2147483647) * (b - a);
  };
  return [0, 1, 2].map(() => {
    const canvas = document.createElement('canvas');
    canvas.width = FLARE.w;
    canvas.height = FLARE.h;
    const g = canvas.getContext('2d');
    g.globalCompositeOperation = 'lighter';
    const tongue = (angle, length, width, [r, gr, b], a) => {
      g.save();
      g.translate(FLARE.mouth, FLARE.h / 2);
      g.rotate(angle);
      g.scale(length, width);
      const fill = g.createRadialGradient(0.3, 0, 0, 0.5, 0, 0.5);
      fill.addColorStop(0, `rgba(${r}, ${gr}, ${b}, ${a})`);
      fill.addColorStop(0.3, `rgba(${r}, ${gr}, ${b}, ${a * 0.55})`);
      fill.addColorStop(0.65, `rgba(${r}, ${gr}, ${b}, ${a * 0.14})`);
      fill.addColorStop(1, `rgba(${r}, ${gr}, ${b}, 0)`);
      g.fillStyle = fill;
      g.fillRect(0, -0.5, 1, 1);
      g.restore();
    };
    // Dıştan içe: kızıl sıcak hava, turuncu diller, ağızda beyaz çekirdek.
    for (let i = 0; i < 4; i++) tongue(rnd(-0.34, 0.34), rnd(90, 150), rnd(26, 40), [196, 58, 10], 0.2);
    for (let i = 0; i < 7; i++) tongue(rnd(-0.2, 0.2), rnd(110, 232), rnd(9, 20), [255, 128, 30], 0.42);
    for (let i = 0; i < 3; i++) tongue(rnd(-0.07, 0.07), rnd(84, 140), rnd(6, 10), [255, 208, 124], 0.75);
    tongue(0, 62, 8, [255, 246, 222], 1);
    return canvas;
  });
}

/**
 * Sabit hücreli boyama defteri; hücre = (tür, ulus rengi, yön, kare). Tek dev tuval yerine
 * küçük sayfalar: boyanan tuval bir sonraki okumada kopyalanır, kopyanın bedeli sayfa
 * boyuyla büyür. Sayfalar gerektikçe açılır, tavana varınca en eski hücre geri alınır.
 */
const PAGE_PX = 1280;
/**
 * Hücre kademesi başına hücre tavanı (büyükten küçüğe, bkz. bookFor); sayfalar gerektikçe açılır.
 * Tavan sayfa değil hücre sayısıdır: 192'lik hücrede 12 sayfa 432 hücre eder, eski 160'lık
 * defterin 768'inden az. Çok ulusun karıştığı cephede canlandırma kareleri (ulus × tür × yön
 * × kare) sığmazsa defter her karede yeniden boyanır.
 */
const MAX_CELLS = [768, 768, 512];

class TintBook {
  constructor(cell, cells) {
    this.cell = cell;
    this.cols = Math.floor(PAGE_PX / cell);
    // Sayfa hücrelerin tam katıdır: 192'lik hücrede 1280'in artan şeridi boşa bellek tutmasın.
    this.pagePx = this.cols * cell;
    this.perPage = this.cols * this.cols;
    this.capacity = this.perPage * Math.ceil(cells / this.perPage);
    this.pages = [];
    this.slots = new Map();
    this.keys = new Float64Array(this.capacity).fill(-1);
    this.used = new Float64Array(this.capacity);
    this.next = 0;
    this.scratch = document.createElement('canvas');
    this.scratch.width = cell;
    this.scratch.height = cell;
    this.sctx = this.scratch.getContext('2d');
    this.sctx.imageSmoothingQuality = 'high';
    // Genişletilmiş maske ve kontur için ara tuvaller.
    this.maskCanvas = document.createElement('canvas');
    this.maskCanvas.width = cell;
    this.maskCanvas.height = cell;
    this.mctx = this.maskCanvas.getContext('2d');
    this.mctx.imageSmoothingQuality = 'high';
    this.lineCanvas = document.createElement('canvas');
    this.lineCanvas.width = cell;
    this.lineCanvas.height = cell;
    this.lctx = this.lineCanvas.getContext('2d');
  }

  page(index) {
    let page = this.pages[index];
    if (!page) {
      const canvas = document.createElement('canvas');
      canvas.width = this.pagePx;
      canvas.height = this.pagePx;
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingQuality = 'high';
      page = { canvas, ctx };
      this.pages[index] = page;
    }
    return page;
  }

  /** Boş hücre, yoksa en uzun süredir kullanılmayan hücre. */
  claim(key) {
    let slot = this.next;
    if (slot < this.capacity) this.next++;
    else {
      slot = 0;
      for (let i = 1; i < this.capacity; i++) if (this.used[i] < this.used[slot]) slot = i;
      this.slots.delete(this.keys[slot]);
    }
    this.keys[slot] = key;
    this.slots.set(key, slot);
    return slot;
  }
}

export class MiniLayer {
  constructor(renderer) {
    this.renderer = renderer;
    // ?minis=0 ölçüm tabanıdır: oyuncunun kayıtlı ayarı onu ezmesin.
    this.forcedOff = typeof location !== 'undefined' && /[?&]minis=0\b/.test(location.search);
    this.enabled = !this.forcedOff;
    this.atlases = new Map();
    this.books = new Map();
    this.tints = new Map();
    this.tintIds = new Map();
    this.facing = new Map();
    this.glides = new Map();
    this.plates = new Map();
    this.plateMemo = new Map();
    this.compositions = new Map();
    this.queue = [];
    this.order = [];
    this.count = 0;
    this.glows = [];
    this.glowCount = 0;
    this.plateQueue = [];
    this.tick = 0;
    this.bakes = 0;
    this.live = false;
    this.lastDraw = 0;
    this.paused = false;
    this.battles = null;
    this.blend = 0;
    this.counterAlpha = 1;
    this.plateAlpha = 0;
    this.selection = null;
    this.hovered = null;
    /** Bu geçişte zemin halkası alan yığınlar; sayaç çerçevesi onları atlar. */
    this.rings = [];
    this.ringed = new Set();
    /** Son yığının ekranda kapladığı alan: adlar figürün üstüne yazılmasın. */
    this.foot = { left: 0, top: 0, right: 0 };
    /** Bu karede tıklanabilen levha ve figür alanları (dünya birimi). */
    this.hits = [];
  }

  /**
   * Noktanın altındaki yığın: önce levha, sonra figürler. Levha sayacın merkezinden
   * uzakta durduğu için sayacın tıklama yarıçapı ona hiç ulaşmıyordu.
   */
  unitAt(x, y) {
    const pad = 3 / Math.max(0.01, this.zoom ?? 1);
    let body = null;
    for (let i = this.hits.length - 1; i >= 0; i--) {
      const h = this.hits[i];
      const mid = (h.left + h.right) / 2;
      let dx = x - mid;
      if (this.P) dx -= this.P * Math.round(dx / this.P);
      const px = mid + dx;
      if (px >= h.left - pad && px <= h.right + pad && y >= h.top - pad && y <= h.bottom + pad) return h.unit;
      if (!body && px >= h.footLeft && px <= h.footRight && y >= h.footTop && y < h.top) body = h.unit;
    }
    return body;
  }

  /**
   * Seçim kutusunun değdiği yığınlar. Levha hexin merkezinden uzakta durur: yalnız merkeze
   * bakan kutu, levhaların üstünden geçse de birimi seçmiyordu.
   */
  stacksInBox(x0, y0, x1, y1) {
    const found = new Set();
    const midX = (x0 + x1) / 2;
    for (const h of this.hits) {
      const left = Math.min(h.left, h.footLeft);
      const right = Math.max(h.right, h.footRight);
      const shift = this.P ? this.P * Math.round((midX - (left + right) / 2) / this.P) : 0;
      if (left + shift > x1 || right + shift < x0 || h.footTop > y1 || h.bottom < y0) continue;
      for (const unit of h.stack) found.add(unit);
    }
    return found;
  }

  /** Harita görünümünü değiştiren anahtar: pişmiş katmanlar da bilsin. */
  setEnabled(on) {
    this.enabled = !!on && !this.forcedOff;
    this.renderer.invalidateCache();
    this.renderer.requestFrame?.();
  }

  /** Sayaç → figür karışımı; 0 sayaç, 1 figür. */
  blendAt(zoom) {
    return this.enabled ? smoothstep(MINI_ZOOM_IN, MINI_ZOOM_FULL, zoom) : 0;
  }

  /** Su tiki 2B katmanı da yenilemeli mi? */
  due(now = performance.now()) {
    return this.live && now - this.lastDraw >= TICK_MS;
  }

  /** Tam karenin başı: canlılık bu karede yeniden hesaplanır. */
  frameStart(paused, selection = null, hovered = null) {
    this.paused = !!paused;
    this.selection = selection;
    this.hovered = hovered;
    this.hits.length = 0;
    this.live = false;
  }

  atlas(kind) {
    let entry = this.atlases.get(kind);
    if (entry) return entry.ready ? entry : null;
    entry = { ready: false, base: null, mask: null, meta: MINI_ATLAS.types[kind] };
    this.atlases.set(kind, entry);
    if (!entry.meta) return null;
    const load = (name) => fetch(new URL(`../../assets/minis/${name}.webp`, import.meta.url))
      .then((r) => { if (!r.ok) throw new Error(`${name} ${r.status}`); return r.blob(); })
      .then((blob) => createImageBitmap(blob, { colorSpaceConversion: 'none' }));
    Promise.all([load(kind), load(`${kind}-mask`)]).then(([base, mask]) => {
      entry.base = base;
      entry.mask = mask;
      entry.ready = true;
      this.renderer.requestFrame?.();
    }).catch((err) => console.warn('[minis] atlas yüklenemedi:', kind, err.message));
    return null;
  }

  /** Yakınlaşma sürerken atlasları önceden indirir. */
  want(stack, zoom) {
    if (!this.enabled || zoom < PRELOAD_ZOOM) return;
    for (const unit of stack) {
      const kind = unit.embarked ? 'transport' : KIND_OF[unit.type.id];
      if (kind) this.atlas(kind);
    }
  }

  tintOf(nation, kind) {
    const naval = kind === 'warship' || kind === 'submarine' || kind === 'transport';
    const key = nation.id * 2 + (naval ? 1 : 0);
    const stamp = `${nation.hue}|${nation.sat}|${nation.light}`;
    let row = this.tints.get(key);
    if (!row || row.stamp !== stamp) {
      const color = naval ? clothTint(nation, NAVAL_GREY, 0.62) : clothTint(nation, FIELD_DRAB, 0.28);
      let id = this.tintIds.get(color);
      if (id === undefined) {
        id = this.tintIds.size;
        this.tintIds.set(color, id);
      }
      row = { stamp, color, id };
      this.tints.set(key, row);
    }
    return row;
  }

  /** Atlasın hücre boyu: yeni pişirimler kendi ölçüsünü taşır, eskiler (deniz) varsayılanı. */
  cellOf(atlas) {
    return atlas.meta.cell ?? MINI_ATLAS.cell;
  }

  bookFor(px, size = MINI_ATLAS.cell) {
    // Hücre ekrandaki boydan HİÇ küçük olmaz: 88 px'lik figür 80'lik hücreden büyütülünce
    // bulanık ve pikselli görünüyordu (Kerem: "üniteler 144p"). Büyükten küçültmek nettir.
    // Ama gereğinden büyük de olmaz: 192'lik atlası zoom 1.6'da (figür 114-140 px) tam boy
    // hücreden basmak kareyi 1.8 → 3.3 ms'ye çıkarıyordu (ölçüldü; aynı oturumda 160'lık
    // hücreyle 1.7-1.9). Bu yüzden ara kademe eski hücre boyudur; tam boy yalnız ekranda
    // 160 px'i aşan figüre (yakın zoomda tank, yüksek DPR) açılır.
    const steps = size > MINI_ATLAS.cell ? [size, MINI_ATLAS.cell, size / 2, size / 4] : [size, size / 2, size / 4];
    let level = 0;
    while (level + 1 < steps.length && steps[level + 1] >= px) level++;
    const cell = Math.round(steps[level]);
    let book = this.books.get(cell);
    if (!book) {
      book = new TintBook(cell, MAX_CELLS[Math.min(level, MAX_CELLS.length - 1)]);
      this.books.set(cell, book);
    }
    return book;
  }

  /** Levha sprite'ları düşer (doku ya da yazı tipi geldi): sonraki karede yeniden pişer. */
  dropPlates() {
    this.plates.clear();
    this.plateMemo.clear();
  }

  /** Ulus rengiyle boyanmış kare; bütçe bittiyse -1. */
  slot(book, atlas, kindIdx, tint, dir, frame) {
    const key = (tint.id * 8 + kindIdx) * 160 + dir * 20 + frame;
    let slot = book.slots.get(key);
    if (slot !== undefined) {
      book.used[slot] = this.tick;
      return slot;
    }
    if (this.bakes >= BAKES_PER_FRAME || this.bakeMs >= BAKE_BUDGET_MS) return -1;
    const t0 = performance.now();
    this.bakes++;
    slot = book.claim(key);
    book.used[slot] = this.tick;
    const { cell, sctx: s, scratch } = book;
    const g = book.page(Math.floor(slot / book.perPage)).ctx;
    const C = this.cellOf(atlas);
    const maskScale = atlas.meta.maskScale ?? MINI_ATLAS.maskScale;
    const M = C / maskScale;
    // Eski pişirim (deniz) yarım çözünürlüklü maske ve koyu kontur ister. Yenisi ikisini de
    // istemez: tam maske ulus rengini yüze ve tüfeğe taşırmaz, siluet Blender'daki arka
    // ışıkla ayrılır. Kontur figürü kesilip yapıştırılmış bir çıkartma gibi gösteriyordu.
    const legacy = maskScale > 1;
    const sx = frame * C;
    const sy = dir * C;
    // Üniforma katmanı: ışık × ulus rengi, örtü tabandan, pay maskeden.
    s.globalCompositeOperation = 'copy';
    s.drawImage(atlas.base, sx, sy, C, C, 0, 0, cell, cell);
    s.globalCompositeOperation = 'multiply';
    s.fillStyle = tint.color;
    s.fillRect(0, 0, cell, cell);
    s.globalCompositeOperation = 'destination-in';
    s.drawImage(atlas.base, sx, sy, C, C, 0, 0, cell, cell);
    if (legacy) {
      // Maske birleşimi: dört yöne yarım hücre pikseli kaydırılmış dört kopya.
      const mk = book.mctx;
      const d = Math.max(0.6, cell / 160);
      mk.globalCompositeOperation = 'copy';
      mk.drawImage(atlas.mask, frame * M, dir * M, M, M, 0, 0, cell, cell);
      mk.globalCompositeOperation = 'source-over';
      for (const [ox, oy] of [[d, 0], [-d, 0], [0, d], [0, -d]]) mk.drawImage(atlas.mask, frame * M, dir * M, M, M, ox, oy, cell, cell);
      s.drawImage(book.maskCanvas, 0, 0);
      // Kontur: siluetin koyu kopyası dört yöne bir piksel kaydırılır, figür üstüne gelir.
      const ln = book.lctx;
      ln.globalCompositeOperation = 'copy';
      ln.drawImage(atlas.base, sx, sy, C, C, 0, 0, cell, cell);
      ln.globalCompositeOperation = 'source-in';
      ln.fillStyle = 'rgba(8, 10, 12, 0.85)';
      ln.fillRect(0, 0, cell, cell);
      ln.globalCompositeOperation = 'source-over';
    } else s.drawImage(atlas.mask, sx, sy, C, C, 0, 0, cell, cell);
    const local = slot % book.perPage;
    const x = (local % book.cols) * cell;
    const y = Math.floor(local / book.cols) * cell;
    g.clearRect(x, y, cell, cell);
    if (legacy) {
      const o = Math.max(0.75, cell / 120);
      for (const [ox, oy] of [[o, 0], [-o, 0], [0, o], [0, -o]]) g.drawImage(book.lineCanvas, x + ox, y + oy);
    }
    g.drawImage(atlas.base, sx, sy, C, C, x, y, cell, cell);
    g.globalCompositeOperation = 'source-atop';
    g.drawImage(scratch, x, y);
    g.globalCompositeOperation = 'source-over';
    this.bakeMs += performance.now() - t0;
    return slot;
  }

  /** Geçiş başı: kuyruklar boşalır, muharebe tablosu gerektiğinde bir kez kurulur. */
  begin(world, zoom, blend) {
    this.tick++;
    this.bakes = 0;
    this.bakeMs = 0;
    this.count = 0;
    this.glowCount = 0;
    this.plateQueue.length = 0;
    this.world = world;
    this.zoom = zoom;
    // HOI4 ölçeği (Kerem): figür tam belirdiği zoomdan sonra büyümez, ekranda aynı
    // boyda kalır. Yakında harita açılır, figürler birbirine ve okların üstüne binmez.
    this.fit = Math.min(1, MINI_ZOOM_HOLD / Math.max(0.01, zoom));
    // Önce figür belirir, sayaç onun üstünden sonra çekilir: ikisi birden yarı saydam
    // kaldığında geçiş bandı bulanık bir yığın gibi okunuyordu.
    this.blend = smoothstep(0, 0.6, blend);
    this.counterAlpha = 1 - smoothstep(0.45, 1, blend);
    // Levha sayaç çekildiği ölçüde gelir (toplam hep 1): ayrı eğrilerde arada bilgi sönüyordu.
    this.plateAlpha = 1 - this.counterAlpha;
    this.rings.length = 0;
    this.ringed.clear();
    this.now = performance.now();
    this.time = this.now / 1000;
    this.P = world.wrapWidth || 0;
    this.battles = null;
    if (this.facing.size > 6000) this.facing.clear();
    if (this.glides.size > 6000) this.glides.clear();
  }

  battleOf(id) {
    if (!this.battles) {
      this.battles = new Map();
      for (const battle of this.world.battleSystem?.battles ?? []) this.battles.set(battle.id, battle);
    }
    return this.battles.get(id) ?? null;
  }

  delta(from, to) {
    let dx = to.x - from.x;
    if (this.P) dx -= this.P * Math.round(dx / this.P);
    return [dx, to.y - from.y];
  }

  dirTo(dx, dy) {
    return (Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) + 8) % 8;
  }

  /** Yığının davranışı ve baktığı yön. */
  stance(unit, tile) {
    let anim = 'idle';
    let dir = this.facing.get(unit.id);
    if (dir === undefined) dir = 1 + (unit.id % 3);
    if (unit.battleId) {
      anim = 'fire';
      const battle = this.battleOf(unit.battleId);
      if (battle) {
        const target = this.world.get(battle.q, battle.r);
        const foe = target && target !== tile ? target : this.attackerTile(battle);
        if (foe && foe !== tile) {
          const [dx, dy] = this.delta(tile, foe);
          dir = this.dirTo(dx, dy);
        }
      }
    } else if (unit.path?.length) {
      const [dx, dy] = this.delta(tile, unit.path[0]);
      if (dx || dy) dir = this.dirTo(dx, dy);
      anim = this.paused ? 'idle' : 'walk';
    }
    this.facing.set(unit.id, dir);
    this.poseAnim = anim;
    this.poseDir = dir;
  }

  attackerTile(battle) {
    const first = battle.attackers?.[0];
    if (first == null) return null;
    if (typeof first === 'object') return first.tile ?? null;
    return this.world.units.find((u) => u.id === first)?.tile ?? null;
  }

  /** Province sıçramasını kısa bir yürüyüşe çevirir: sim bir karede atlar, göz kaymayı görür. */
  glide(unit, x, y) {
    let g = this.glides.get(unit.id);
    if (!g) {
      g = { x, y, fromX: x, fromY: y, at: -1e9 };
      this.glides.set(unit.id, g);
      this.atX = x;
      this.atY = y;
      return;
    }
    if (g.x !== x || g.y !== y) {
      const was = Math.min(1, (this.now - g.at) / GLIDE_MS);
      const cx = g.fromX + (g.x - g.fromX) * was;
      const cy = g.fromY + (g.y - g.fromY) * was;
      let jump = x - cx;
      if (this.P) jump -= this.P * Math.round(jump / this.P);
      if (Math.hypot(jump, y - cy) < HEX_SIZE * 14) {
        g.fromX = x - jump;
        g.fromY = cy;
        g.at = this.now;
      } else g.at = -1e9;
      g.x = x;
      g.y = y;
    }
    const t = Math.min(1, (this.now - g.at) / GLIDE_MS);
    this.atX = g.fromX + (x - g.fromX) * t;
    this.atY = g.fromY + (y - g.fromY) * t;
  }

  /** Karedeki canlandırma: figür fazı kaydırılır ki bölük aynı anda adım atmasın. */
  frameFor(anim, phase) {
    const def = MINI_ATLAS.anims[anim];
    if (anim === 'fire') {
      if (this.paused) return def.start;
      // Ateş döngüsünün büyük kısmı nişanda geçer: herkes durmadan ateş etmez.
      const t = ((this.time / FIRE_PERIOD) + phase) % 1;
      const span = def.count / FPS.fire / FIRE_PERIOD;
      const i = t < span ? Math.floor((t / span) * def.count) : 0;
      return def.start + Math.min(def.count - 1, i);
    }
    return def.start + (Math.floor(this.time * FPS[anim] + phase * def.count) % def.count);
  }

  figure(kind, tint, anim, dir, x, y, phase) {
    const atlas = this.atlas(kind);
    if (!atlas) return;
    const scale = (FIGURE_SCALE[kind] ?? 1) * (this.fit ?? 1);
    const worldSize = atlas.meta.worldSize * scale;
    const kindIdx = MINI_KINDS.indexOf(kind);
    const book = this.bookFor(worldSize * this.zoom * this.renderer.dpr, this.cellOf(atlas));
    const frame = this.frameFor(anim, phase);
    let slot = this.slot(book, atlas, kindIdx, tint, dir, frame);
    if (slot < 0) {
      // Bütçe bitti: aynı canlandırmanın hazır ilk karesi bu kare yerini tutar.
      const key = (tint.id * 8 + kindIdx) * 160 + dir * 20 + MINI_ATLAS.anims[anim].start;
      slot = book.slots.get(key) ?? -1;
      this.renderer.requestFrame?.();
      if (slot < 0) {
        // Zoom hücre kademesini değiştirdi: yeni defter boş, eskisinde aynı kare var. Ondan
        // ölçeklenip basılır; yoksa figür o karede YOKTU ve sayaç da sönmüş olduğu için
        // birlik görünmez oluyordu (Kerem: "görünmez olma efekti").
        const exact = (tint.id * 8 + kindIdx) * 160 + dir * 20 + frame;
        for (const other of this.books.values()) {
          if (other === book || other.cell < book.cell / 2) continue;
          const hit = other.slots.get(exact) ?? other.slots.get(key);
          if (hit === undefined) continue;
          return this.queueFigure(other, hit, atlas, anim, frame, dir, x, y, worldSize, scale);
        }
        return false;
      }
    }
    return this.queueFigure(book, slot, atlas, anim, frame, dir, x, y, worldSize, scale);
  }

  queueFigure(book, slot, atlas, anim, frame, dir, x, y, worldSize, scale) {
    const { anchor, muzzles, glow } = atlas.meta;
    let f = this.queue[this.count];
    if (!f) {
      f = {};
      this.queue[this.count] = f;
    }
    this.count++;
    const local = slot % book.perPage;
    f.image = book.page(Math.floor(slot / book.perPage)).canvas;
    f.cell = book.cell;
    f.sx = (local % book.cols) * book.cell;
    f.sy = Math.floor(local / book.cols) * book.cell;
    f.x = x;
    f.y = y;
    f.size = worldSize;
    f.ax = anchor[0];
    f.ay = anchor[1];
    if (anim === 'fire') {
      const power = FLASH_POWER[frame - MINI_ATLAS.anims.fire.start];
      if (power) {
        for (const [u, v, angle, reach] of muzzles[dir]) {
          this.flash(x + worldSize * (u - anchor[0]), y + worldSize * (v - anchor[1]), angle, reach, glow * scale, power);
        }
      }
    }
    return true;
  }

  flash(x, y, angle, reach, radius, power) {
    let g = this.glows[this.glowCount];
    if (!g) {
      g = {};
      this.glows[this.glowCount] = g;
    }
    this.glowCount++;
    g.x = x;
    g.y = y;
    g.angle = angle;
    g.reach = reach;
    g.r = radius;
    g.p = power;
  }

  /** Karadaki (ya da bindirilmiş) yığının figürlerini kuyruğa alır; atlas hazır değilse null. */
  stack(ctx, stack, nation, at = null) {
    const unit = stack[0];
    const tile = unit.tile;
    const groups = this.composition(stack);
    if (!groups.length) return null;
    for (let g = 0; g < groups.length; g++) if (!this.atlas(groups[g].kind)) return null;
    // Yer sayaçla ortak (renderer.unitGlide): sayaç ile figür aynı yolda kayar, geçişte sıçramaz.
    if (at) {
      this.atX = at.x;
      this.atY = at.y;
    } else this.glide(unit, tile.x, tile.y + (tile.city ? HEX_SIZE * 0.22 : 0));
    const x = this.atX;
    const y = this.atY;
    this.stance(unit, tile);
    const anim = this.poseAnim;
    const dir = this.poseDir;
    const [hx, hy] = HEADINGS[dir];
    const { kind } = groups[0];
    const { worldSize, anchor } = this.atlas(kind).meta;
    const size = worldSize * (FIGURE_SCALE[kind] ?? 1) * (this.fit ?? 1);
    if (kind === 'transport' && anim === 'walk') this.straightWake(ctx, x, y, hx, hy);
    const rx = Math.max(RING.minRadius * (this.fit ?? 1), size * RING.baseShare);
    const ry = rx * RING.baseSquash;
    // Figür bu karede basılamadıysa sayaç tam görünür kalır (null).
    if (!this.figure(kind, this.tintOf(nation, kind), anim, dir, x, y, hash01(unit.id))) return null;
    const reach = size * RING.bodyShare;
    this.foot.left = x - reach;
    this.foot.right = x + reach;
    this.foot.top = y - size * anchor[1] * RING.headShare;
    this.ring(stack, tile, x, y, rx + RING.pad, ry + RING.pad * SQUASH);
    this.atX = x;
    this.atY = y;
    return this;
  }

  /** Seçili ya da imleç altındaki yığının zemin halkası kuyruğa girer. */
  ring(stack, tile, x, y, rx, ry) {
    const selected = this.selection?.length ? stack.some((u) => this.selection.includes(u)) : false;
    for (const member of stack) this.ringed.add(member);
    if (!selected && this.hovered !== tile) return;
    this.rings.push({
      x,
      y: y + RING.drop,
      rx,
      ry,
      selected,
    });
  }

  /**
   * Halka figürlerin ALTINA, zemine yatar. Sayaç boyundaki dikdörtgen çerçeve figürün
   * üstünden geçip onu kafese alıyordu; çizgi kalınlığı zoomdan bağımsız kalır.
   */
  drawRings(ctx, alpha) {
    const unit = 1 / this.zoom;
    // Her figürün altındaki taraf renkli kaide halkası KALKTI (Kerem: daire "dandik"): figür
    // zemine kendi temas gölgesiyle oturur, taraf levhanın emayesinden okunur. Halka yalnız
    // seçili ya da imleç altındaki yığında kalır.
    for (const r of this.rings) {
      // Halka sayaç çekilirken gelir: geçiş bandında çerçeveyle üst üste binmesin.
      ctx.globalAlpha = alpha * this.plateAlpha * (r.selected ? 1 : 0.55);
      ctx.beginPath();
      ctx.ellipse(r.x, r.y, r.rx, r.ry, 0, 0, Math.PI * 2);
      ctx.lineWidth = 3 * unit;
      ctx.strokeStyle = 'rgba(8, 10, 12, 0.42)';
      ctx.stroke();
      ctx.lineWidth = (r.selected ? 1.5 : 1) * unit;
      ctx.strokeStyle = r.selected ? '#f4dea0' : 'rgba(255, 255, 255, 0.85)';
      ctx.stroke();
    }
    ctx.globalAlpha = alpha;
  }

  /** Yığını temsil eden tek figür: en ağır kol, denizdeyse nakliye gemisi. */
  composition(stack) {
    const unit = stack[0];
    const memo = this.compositions.get(unit.id);
    if (memo && memo.len === stack.length && memo.embarked === unit.embarked && this.tick - memo.tick < 90) return memo.groups;
    const kinds = new Set(stack.map((member) => KIND_OF[member.type.id]));
    const embarked = unit.embarked && unit.tile?.terrain?.water;
    const kind = embarked ? 'transport' : KIND_ORDER.find((name) => kinds.has(name));
    const groups = kind ? [{ kind }] : [];
    if (this.compositions.size > 4000) this.compositions.clear();
    this.compositions.set(unit.id, { len: stack.length, embarked: unit.embarked, tick: this.tick, groups });
    return groups;
  }

  /** Bütün figürler arkadan öne, üstüne namlu ışığı, en üste levhalar. */
  flush(ctx) {
    const n = this.count;
    if (n) this.live = true;
    if (!n && !this.plateQueue.length) return;
    this.lastDraw = this.now;
    const alpha = ctx.globalAlpha;
    this.drawRings(ctx, alpha);
    this.rings.length = 0;
    ctx.globalAlpha = alpha * this.blend;
    const live = this.order;
    live.length = n;
    for (let i = 0; i < n; i++) live[i] = this.queue[i];
    live.sort(byDepth);
    // Küçültme yüksek kalitede: varsayılan 'low' iki kat küçültmede kenarı tırtıklıyordu.
    const smoothing = ctx.imageSmoothingQuality;
    ctx.imageSmoothingQuality = 'high';
    for (let i = 0; i < n; i++) {
      const f = live[i];
      ctx.drawImage(f.image, f.sx, f.sy, f.cell, f.cell,
        f.x - f.size * f.ax, f.y - f.size * f.ay, f.size, f.size);
    }
    ctx.imageSmoothingQuality = smoothing;
    this.drawGlows(ctx, alpha);
    if (this.plateAlpha > 0.01) {
      // Levha ekran pikseline oturur: yarım piksel kayınca yazı bulanıklaşıyordu.
      const m = ctx.getTransform();
      for (const p of this.plateQueue) {
        ctx.globalAlpha = alpha * this.plateAlpha;
        const left = (Math.round(m.a * p.left + m.e) - m.e) / m.a;
        const top = (Math.round(m.d * p.top + m.f) - m.f) / m.d;
        ctx.drawImage(p.sprite, left - p.m, top - p.m, p.w + 2 * p.m, p.h + 2 * p.m);
        this.renderer.drawCounterState(ctx, this.world, p.stack, p.left, p.top, p.w, p.h, this.zoom);
      }
    }
    ctx.globalAlpha = alpha;
    this.count = 0;
    this.glowCount = 0;
    this.plateQueue.length = 0;
  }

  /** Eklemeli ışık: alev namlunun baktığı yöne uzar, her atışta biçimi değişir. */
  drawGlows(ctx, alpha) {
    if (!this.glowCount) return;
    this.flares ??= flareSprites();
    // Namlu ışığı kareleri (assets/fx/muzzle-strip.webp, ChatGPT sayfası; siyah zemin,
    // eklemeli çizim): yüklenince çizilen alev dilinin yerini alır.
    if (!this.muzzle) {
      this.muzzle = { image: null };
      const image = new Image();
      image.decoding = 'async';
      image.addEventListener('load', () => { this.muzzle.image = image; }, { once: true });
      image.src = new URL('../../assets/fx/muzzle-strip.webp', import.meta.url).href;
    }
    const strip = this.muzzle.image;
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < this.glowCount; i++) {
      const g = this.glows[i];
      if (strip) {
        // Güç sönerken kare ilerler: tutuşma, parlama, sönme.
        const frame = Math.max(0, Math.min(7, Math.round((1 - g.p) * 7)));
        const size = g.r * 2.2 * (0.6 + 0.4 * Math.max(0.42, g.reach));
        ctx.globalAlpha = Math.min(1, (0.55 + 0.45 * g.p) * this.blend * alpha);
        ctx.drawImage(strip, frame * 128, 0, 128, 128, g.x - size / 2, g.y - size / 2, size, size);
        continue;
      }
      const sprite = this.flares[Math.abs(Math.floor(this.time * 24) + (g.x | 0)) % this.flares.length];
      // Kameraya bakan namluda alev kısalır: izdüşüm boyu atlastan gelir.
      const length = g.r * 2.5 * (0.7 + 0.3 * g.p) * Math.max(0.42, g.reach);
      const height = length * (FLARE.h / FLARE.w) * (1.15 - 0.3 * g.reach);
      ctx.save();
      ctx.translate(g.x, g.y);
      ctx.rotate(g.angle);
      ctx.globalAlpha = Math.min(1, g.p * this.blend * alpha);
      ctx.drawImage(sprite, -length * (FLARE.mouth / FLARE.w), -height / 2, length, height);
      ctx.restore();
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = alpha;
  }

  /** Yakın zoomda sayacın bilgisi: bayrak, mevcut, güç ve düzen çubukları. */
  plate(unit, stack, nation, side, selected, zoom, labelOf) {
    const count = Math.min(9, stack.length);
    const skin = unitSkinStamp();
    let memo = this.plateMemo.get(unit.id);
    if (!memo || memo.hp !== unit.hp || memo.org !== unit.organization || memo.count !== count
      || memo.selected !== selected || memo.side !== side || memo.nation !== nation.id || memo.skin !== skin) {
      const strength = Math.round(20 * Math.max(0, Math.min(1, unit.hp / Math.max(1, maxHpOf(unit)))));
      const org = Math.round(Math.max(0, Math.min(100, organizationOf(unit))) / 5);
      const label = labelOf(unit);
      const key = `${nation.id}|${label}|${strength}|${org}|${count}|${selected ? 1 : 0}|${side}|${skin}`;
      let sprite = this.plates.get(key);
      if (!sprite) {
        if (this.plates.size > 500) this.plates.clear();
        sprite = this.paintPlate(nation, label, strength / 20, org / 20, count, selected, side);
        this.plates.set(key, sprite);
      }
      if (this.plateMemo.size > 4000) this.plateMemo.clear();
      memo = { hp: unit.hp, org: unit.organization, count, selected, side, nation: nation.id, skin, sprite };
      this.plateMemo.set(unit.id, memo);
    }
    const w = PLATE.w / zoom;
    const h = PLATE.h / zoom;
    // Figürün ayağının hemen altında: eskiden yarım hex aşağıda, çoğu zaman komşu karenin
    // üstündeydi ve hangi kareye ait olduğu okunmuyordu.
    const rect = { sprite: memo.sprite, stack, left: this.atX - w / 2, top: this.atY + 6 / zoom, w, h, m: PLATE.m / zoom };
    this.plateQueue.push(rect);
    // Eğik kamerada levha dünya koordinatında değildir: orada sayacın yarıçapı geçerli kalır.
    if (!this.renderer.upright && this.plateAlpha > 0.2) {
      this.hits.push({
        unit,
        stack,
        left: rect.left,
        right: rect.left + w,
        top: rect.top,
        bottom: rect.top + h,
        footLeft: this.foot.left,
        footRight: this.foot.right,
        footTop: this.foot.top,
      });
    }
    return rect;
  }

  paintPlate(nation, label, strength, org, stackLen, selected, side) {
    // Sayacın künyesiyle aynı malzeme (unitSkin.js): taraf emayesi, pirinç çerçeve, bayrak
    // çipi, oyulmuş yuvada çubuklar. Eskiden yarı saydam koyu kutu + taraf renkli çizgiydi.
    const dpr = Math.max(1, this.renderer.dpr);
    const { w, h, m } = PLATE;
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil((w + 2 * m) * dpr);
    canvas.height = Math.ceil((h + 2 * m) * dpr);
    const g = canvas.getContext('2d');
    g.imageSmoothingQuality = 'high';
    g.scale(dpr, dpr);
    g.translate(m, m);
    const px = 1 / dpr;
    const rim = 2.1;
    paintPlaque(g, { x: 0, y: 0, w, h, side, selected, rim, cut: 6.5, px });
    const flag = this.renderer.flagSprite(nation, 17, 11.3);
    const fx = side === 'hostile' ? 7.5 : 5;
    if (flag) paintFlagChip(g, flag, fx, 4.2, 17, 11.3, px);
    const many = stackLen > 1;
    const tabW = 13;
    const tabH = 12.5;
    paintLabel(g, label, many ? w - tabW + 1 : w - 5.5, 10.2, `800 12.5px ${FONT_UI}`, px);
    paintBars(g, 6, 18.4, w - 12, 2.3, 1.1, strength, org, px);
    // Tümen sayısı köşeye çakılı pirinç etiket: aynı karede kaç tümen olduğu tek bakışta okunur.
    if (many) paintStackTab(g, w - tabW * 0.78, -3.5, tabW, tabH, stackLen, `800 9.5px ${FONT_UI}`, px);
    return canvas;
  }

  // --- Deniz ------------------------------------------------------------------

  /** Köpük izi: geminin geçtiği yol üzerinde açılan iki kol ve ortada çalkantı. */
  wakeStroke(ctx, pts) {
    const n = pts.length;
    ctx.lineCap = 'butt';
    for (let i = 1; i < n; i++) {
      const a = pts[i - 1];
      const b = pts[i];
      const fade = 1 - i / n;
      const churn = 0.8 + 0.2 * Math.sin(this.time * 2.6 + i * 1.7);
      ctx.strokeStyle = `rgba(232, 243, 246, ${(0.3 * fade * churn).toFixed(3)})`;
      ctx.lineWidth = 1.1 + i * 0.22;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.strokeStyle = `rgba(226, 240, 244, ${(0.42 * fade).toFixed(3)})`;
      ctx.lineWidth = 0.7;
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(a.x + a.nx * side * a.w, a.y + a.ny * side * a.w);
        ctx.lineTo(b.x + b.nx * side * b.w, b.y + b.ny * side * b.w);
        ctx.stroke();
      }
    }
  }

  straightWake(ctx, x, y, hx, hy) {
    const pts = [];
    for (let k = 0; k <= WAKE.samples; k++) {
      const d = 16 + k * 5;
      pts.push({ x: x - hx * d, y: y - hy * d * SQUASH, nx: -hy, ny: hx * SQUASH, w: 1 + k * WAKE.spread });
    }
    const alpha = ctx.globalAlpha;
    ctx.globalAlpha = alpha * this.blend;
    this.wakeStroke(ctx, pts);
    ctx.globalAlpha = alpha;
  }

  /** Devriye elipsindeki gemi: konum, yön ve arkasındaki köpük izi analitik yoldan gelir. */
  patrolShip(ctx, kind, tint, cx, cy, radius, angle, firing, phase) {
    const rx = PATROL.rx + radius;
    const ry = PATROL.ry + radius * 0.55;
    const x = cx + rx * Math.cos(angle);
    const y = cy + ry * Math.sin(angle);
    const dir = this.dirTo(-rx * Math.sin(angle), ry * Math.cos(angle));
    const pts = [];
    for (let k = 1; k <= WAKE.samples; k++) {
      const a = angle - (0.2 + k * WAKE.gap) * (40 / rx);
      const tx = -rx * Math.sin(a);
      const ty = ry * Math.cos(a);
      const len = Math.hypot(tx, ty) || 1;
      pts.push({ x: cx + rx * Math.cos(a), y: cy + ry * Math.sin(a), nx: -ty / len, ny: tx / len, w: 1 + k * WAKE.spread });
    }
    const alpha = ctx.globalAlpha;
    ctx.globalAlpha = alpha * this.blend;
    this.wakeStroke(ctx, pts);
    ctx.globalAlpha = alpha;
    this.figure(kind, tint, firing ? 'fire' : 'walk', dir, x, y, phase);
  }

  /** Bölgedeki filolar: ulus başına en çok üç gemi görünür, sayıyı rozet söyler. */
  drawFleets(ctx, world, rect, playerId, everyone) {
    const blend = this.blendAt(this.renderer.camera.zoom);
    const state = world.navyState;
    if (blend <= 0 || (!state?.presence?.size && !state?.subs?.size)) return;
    this.begin(world, this.renderer.camera.zoom, blend);
    const geo = this.renderer.sea.geometry(world);
    const U = this.renderer.upright;
    const turn = world.turn ?? 0;
    const fighting = new Set();
    for (const report of state.reports ?? []) if (turn - report.turn <= 1) fighting.add(report.zone);
    const P = world.wrapWidth || 0;
    const sideOf = (id) => this.renderer.sideOf(world, id, playerId);
    const zone = (zoneId, here, kind, keep) => {
      const anchor = geo.anchors[zoneId];
      if (!anchor || !this.atlas(kind)) return;
      let row = 0;
      for (const [nationId, entry] of here) {
        const side = sideOf(nationId);
        if (!keep(side)) continue;
        const nation = world.nations[nationId];
        const tint = this.tintOf(nation, kind);
        const ships = Math.min(PATROL.perNation, entry.ships.length);
        const lane = row * PATROL.step + (kind === 'submarine' ? 26 : 0);
        for (const dx of P ? [-P, 0, P] : [0]) {
          const x = anchor.x + dx;
          const pad = PATROL.rx + lane + 40;
          if (x < rect.minX - pad || x > rect.maxX + pad || anchor.y < rect.minY - pad || anchor.y > rect.maxY + pad) continue;
          if (U && !U.pin(ctx, x, anchor.y)) continue;
          for (let i = 0; i < ships; i++) {
            const start = hash01(zoneId * 13 + nationId * 7) * Math.PI * 2 + (i / ships) * Math.PI * 2;
            const angle = start + this.time * PATROL.speed * (row % 2 ? -1 : 1);
            this.patrolShip(ctx, kind, tint, x, anchor.y, lane, angle, fighting.has(zoneId) && kind !== 'transport', hash01(zoneId + i * 11));
          }
          if (U) this.flush(ctx);
        }
        if (++row >= 3) break;
      }
    };
    for (const [zoneId, here] of state.presence ?? []) zone(zoneId, here, 'warship', (s) => everyone || s !== 'other');
    for (const [zoneId, here] of state.subs ?? []) zone(zoneId, here, 'submarine', (s) => everyone || s === 'own' || s === 'hostile');
    this.flush(ctx);
  }
}
