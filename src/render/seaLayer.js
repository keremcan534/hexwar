// DENİZ KATMANI: Seas harita kipinin bölge tonları ve adları, bütün siyasi
// kiplerde filo ve deniz muharebesi işaretleri (game/navy.js).
//
// Ton her kare çizilmez. Bölgeler düşük çözünürlüklü bir dokuya basılır, kara
// sınır ağının YUMUŞAK kıyısıyla oyulur (hex kenarlı ton karaya 17 px'e dek
// taşıyordu) ve doku yalnız bölgelerin renk imzası değişince yeniden basılır
// (haftada en çok bir). Kare başına maliyet kopya başına tek drawImage ve
// birkaç işaret.

import { FONT_DISPLAY, FONT_UI } from './fonts.js';
import { DIRS, HEX_CORNERS } from '../core/hex.js';
import { HEX_SIZE } from '../world/worldgen.js';
import { seaZonesOf } from '../world/seaZones.js';
import { atWar } from '../game/diplomacy.js';
import { isAllied } from '../game/alliances.js';
import { seaLaneView } from '../game/seaLanes.js';
import { fleetMarks, seaZoneMarks } from '../game/navy.js';
import { drawFlag } from './flagPainter.js';

/** Ton dokusunun ölçeği (doku pikseli / dünya pikseli). */
const TINT_SCALE = 0.25;
/** Muharebe işareti bu kadar hafta durur. */
const BATTLE_MARK_WEEKS = 2;

/**
 * Oyuncunun bakışından renkler. Diplomasi kipiyle aynı aile (yeşil biz, mavi
 * müttefik, kırmızı düşman); çekişmeli deniz kehribar.
 */
export const SEA_COLORS = {
  ours: 'rgba(96, 178, 110, 0.34)',
  ally: 'rgba(84, 140, 205, 0.32)',
  enemy: 'rgba(214, 74, 58, 0.36)',
  contested: 'rgba(224, 168, 64, 0.36)',
  other: 'rgba(150, 168, 186, 0.16)',
};
const MARK_COLORS = {
  ours: '#8fd39a', ally: '#8cb8ea', enemy: '#ff8f6e', other: '#b9c3cc',
};
/** Kapalı deniz taraması (dünya pikseli): kırmızı çapraz çizgi. */
const HATCH = { color: 'rgba(214, 74, 58, 0.42)', width: 6, gap: 40 };
/** Yoldaki gemilerimizin rota çizgisi (pirinç). */
const ROUTE_COLOR = 'rgba(240, 208, 128, 0.9)';

/**
 * İşaretlerin ekran ölçüleri (px; dünyaya /zoom ile çizilir). TEK kaynak:
 * çizim de cephe levhalarının engel kutuları da (markBoxes) buradan okur.
 * Levha engeli elle tutulan 140×62'lik bir kutuydu; donanma işaretleri
 * (abluka hapları, muharebe etiketi, kapalı deniz yazısı) onu aşınca levha
 * onları örtüyordu.
 */
/** Kaçınma diskindeki dönüş oku, 24 birimlik kutuda (glyphs.js 'return'). Path2D
 * ilk çizimde kurulur: modül Node'da da içe aktarılabilsin. */
let RETURN_PATH = null;
const returnPath = () => (RETURN_PATH ??= new Path2D('M9 6.5L4 11.5l5 5M4.5 11.5h10a5 5 0 0 1 0 10H12'));

const MARK = {
  badgeTop: 4, badgeH: 14, subH: 12.6, rowGap: 3, badgePad: 3, flagW: 15, subFlagW: 12,
  pillH: 15, pillStep: 17, pillPad: 4, pillFlagW: 15,
  disc: 7, discFresh: 8.75, labelGap: 4, closedRise: 30,
};
const MARK_FONT = {
  badge: (zoom) => `700 ${10.5 / zoom}px ${FONT_UI}`,
  pill: (zoom) => `600 ${12 / zoom}px ${FONT_UI}`,
  label: (zoom) => `600 ${12 / zoom}px ${FONT_UI}`,
  closed: (zoom) => `700 ${11 / zoom}px ${FONT_UI}`,
  name: (zoom) => `italic ${12.5 / zoom}px ${FONT_DISPLAY}`,
};
const CLOSED_TEXT = 'CLOSED TO OUR TROOPS';

/**
 * OYUNCUNUN FİLO SAYACI (ekran px; dünyaya /zoom). Eski rozet (14 px bayrak +
 * sayı) bütün ulusların rozetiyle aynıydı ve tıklanmıyordu: oyuncu kendi
 * filosunu haritada bulamıyor, ona emir veremiyordu (1536×864, NAVY1). Sayaç
 * daha büyük, emrin rengiyle çerçeveli (Auto pirinç, deniz emri yeşil, liman
 * gri), yakın zoomda filonun adını yazar; tıklanır (fleetAt), seçiliyken sağ
 * tık denize emirdir (game.handleRightTap).
 */
const COUNTER = { h: 20, pad: 5, flagW: 15, flagH: 10, ship: 16, gap: 4, nameZoom: 0.45, gapItems: 4 };
const COUNTER_FONT = { count: `700 12.5px ${FONT_UI}`, name: `600 12px ${FONT_UI}` };
const MODE_COLORS = { auto: '#dcc07a', sea: '#8fd39a', port: '#9aa7b1' };
/** Gövde silueti, 16×10 kutuda: pruva sağda, köprü ve baca. */
let HULL_PATH = null;
const hullPath = () => (HULL_PATH ??= new Path2D('M0 6.2h16l-2.4 3.3H2.2z M3.5 6.2V4.4h4.2V2.6h1.6v1.8h2.3v1.8z M6 2.6V0.6h1.1v2z'));
/** Muharebe/kaçınma diskinin etiketi bu zoomdan yakında yazılır. */
const LABEL_ZOOM = 0.5;
const REL_ORDER = { ours: 0, ally: 1, enemy: 2, other: 3 };

/** Rozet satırının yerleşimi; `measure(text)` o anki yazı tipinde genişlik. */
function badgeLayout(measure, rows, sub, zoom) {
  const pad = MARK.badgePad / zoom;
  const flagW = (sub ? MARK.subFlagW : MARK.flagW) / zoom;
  const texts = rows.map((row) => (sub ? `U${row.count}` : String(row.count)));
  const widths = texts.map((text) => flagW + pad * 3 + measure(text));
  const total = widths.reduce((sum, w) => sum + w, 0) + (rows.length - 1) * pad;
  return { pad, flagW, texts, widths, total };
}

/** Hap genişliği (bayraklı hayalet rozet dahil). */
function pillWidth(measure, pill, zoom) {
  const pad = MARK.pillPad / zoom;
  const flagW = pill.flag ? MARK.pillFlagW / zoom : 0;
  return measure(pill.text) + pad * 2 + (flagW ? flagW + pad : 0);
}

const CORNERS = HEX_CORNERS.map(([x, y]) => [x * HEX_SIZE, y * HEX_SIZE]);

function appendLoop(path, pts, dx) {
  const m = pts.length / 2;
  if (m < 2) return;
  path.moveTo(pts[0] + dx, pts[1]);
  for (let i = 1; i < m; i++) path.lineTo(pts[i * 2] + dx, pts[i * 2 + 1]);
  path.closePath();
}

const keyOf = (x, y) => `${Math.round(x * 4)},${Math.round(y * 4)}`;

/** Kenar parçalarını uç uca çoklu çizgilere bağlar (düz dizi x0,y0,x1,y1...). */
function chainSegments(segments) {
  const byPoint = new Map();
  segments.forEach((seg, index) => {
    for (const end of [0, 1]) {
      const key = keyOf(seg[end * 2], seg[end * 2 + 1]);
      if (!byPoint.has(key)) byPoint.set(key, []);
      byPoint.get(key).push(index);
    }
  });
  const used = new Uint8Array(segments.length);
  const lines = [];
  const extend = (points, x, y) => {
    for (;;) {
      const next = (byPoint.get(keyOf(x, y)) ?? []).find((index) => !used[index]);
      if (next === undefined) return;
      used[next] = 1;
      const seg = segments[next];
      const forward = keyOf(seg[0], seg[1]) === keyOf(x, y);
      x = forward ? seg[2] : seg[0];
      y = forward ? seg[3] : seg[1];
      points.push(x, y);
    }
  };
  segments.forEach((seg, index) => {
    if (used[index]) return;
    used[index] = 1;
    const tail = [seg[0], seg[1], seg[2], seg[3]];
    extend(tail, seg[2], seg[3]);
    const head = [];
    extend(head, seg[0], seg[1]);
    const line = [];
    for (let i = head.length - 2; i >= 0; i -= 2) line.push(head[i], head[i + 1]);
    lines.push(line.concat(tail));
  });
  return lines;
}

/** Bir tur Chaikin köşe kırpması; uçlar yerinde kalır. */
function chaikin(points) {
  const n = points.length / 2;
  if (n < 3) return points;
  const out = [points[0], points[1]];
  for (let i = 0; i < n - 1; i++) {
    const x0 = points[i * 2];
    const y0 = points[i * 2 + 1];
    const x1 = points[i * 2 + 2];
    const y1 = points[i * 2 + 3];
    out.push(0.75 * x0 + 0.25 * x1, 0.75 * y0 + 0.25 * y1, 0.25 * x0 + 0.75 * x1, 0.25 * y0 + 0.75 * y1);
  }
  out.push(points[n * 2 - 2], points[n * 2 - 1]);
  return out;
}

/**
 * Sarmal dünyada bir noktanın ekrana düşen kopyaları (kaydırma listesi).
 * Ton, ad ve işaretler yalnız ana kopyaya çiziliyordu: dikişin öbür yanında
 * deniz tonsuz kalıyordu.
 */
function copiesIn(x, y, rect, P, margin = 0) {
  if (y < rect.minY - margin || y > rect.maxY + margin) return [];
  const out = [];
  for (const dx of P ? [-P, 0, P] : [0]) {
    if (x + dx >= rect.minX - margin && x + dx <= rect.maxX + margin) out.push(dx);
  }
  return out;
}

/** Oyuncuya göre ilişki: ours · ally · enemy · other. */
function relationTo(world, playerId, nationId) {
  if (playerId < 0) return 'other';
  if (nationId === playerId) return 'ours';
  const player = world.nations[playerId];
  if (player && isAllied(player, nationId)) return 'ally';
  if (atWar(world, playerId, nationId)) return 'enemy';
  return 'other';
}

/** Bölgedeki ulus satırları: ilişki sırası, sonra gemi sayısı; en çok üç. */
function fleetRows(world, playerId, here, keep) {
  return [...here.entries()]
    .map(([nationId, entry]) => ({ nationId, count: entry.ships.length, rel: relationTo(world, playerId, nationId) }))
    .filter(keep)
    .sort((a, b) => REL_ORDER[a.rel] - REL_ORDER[b.rel] || b.count - a.count || a.nationId - b.nationId)
    .slice(0, 3);
}

export class SeaLayer {
  constructor(renderer) {
    this.renderer = renderer;
    this.geo = null;
    this.land = null;
    this.tex = null;
    /** Donanma panelinde üstünde durulan bölge (navyDock.mark). */
    this.highlight = null;
  }

  /** Bölge hex birleşimleri, bölgeler arası sınır ve işaret yerleri (dünya başına). */
  geometry(world) {
    if (this.geo?.world === world) return this.geo;
    const zones = seaZonesOf(world).zones;
    const paths = zones.map((zone) => {
      const path = new Path2D();
      for (const idx of zone.tiles) {
        const tile = world.tiles[idx];
        path.moveTo(tile.x + CORNERS[0][0], tile.y + CORNERS[0][1]);
        for (let c = 1; c < 6; c++) path.lineTo(tile.x + CORNERS[c][0], tile.y + CORNERS[c][1]);
        path.closePath();
      }
      return path;
    });
    // Bölgeler arası kenar bir kez (küçük kimlikli taraftan) toplanır, uç
    // uca zincirlenir ve iki tur Chaikin ile yumuşatılır: hex basamaklı kesik
    // çizgi haritanın yumuşak sınır diliyle çelişiyordu.
    const segments = [];
    for (const zone of zones) {
      for (const idx of zone.tiles) {
        const tile = world.tiles[idx];
        for (let d = 0; d < 6; d++) {
          const near = world.get(tile.q + DIRS[d][0], tile.r + DIRS[d][1]);
          if (!near?.terrain?.water || !(near.seaZone >= 0) || near.seaZone <= zone.id) continue;
          const a = CORNERS[d];
          const b = CORNERS[(d + 1) % 6];
          segments.push([tile.x + a[0], tile.y + a[1], tile.x + b[0], tile.y + b[1]]);
        }
      }
    }
    const borders = new Path2D();
    for (const line of chainSegments(segments)) {
      const smooth = chaikin(chaikin(line));
      borders.moveTo(smooth[0], smooth[1]);
      for (let i = 2; i < smooth.length; i += 2) borders.lineTo(smooth[i], smooth[i + 1]);
    }
    const anchors = zones.map((zone) => {
      const tile = world.tiles[zone.anchor];
      return { x: tile.x, y: tile.y };
    });
    // Tarama yalnız bölgenin kutusunda çizilir (kırpma yolu bölgenin kendisi).
    const boxes = zones.map((zone) => {
      let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
      for (const idx of zone.tiles) {
        const tile = world.tiles[idx];
        minX = Math.min(minX, tile.x); maxX = Math.max(maxX, tile.x);
        minY = Math.min(minY, tile.y); maxY = Math.max(maxY, tile.y);
      }
      return { minX: minX - HEX_SIZE, minY: minY - HEX_SIZE, maxX: maxX + HEX_SIZE, maxY: maxY + HEX_SIZE };
    });
    const P = world.wrapWidth || 0;
    const x0 = -(Math.sqrt(3) * HEX_SIZE) / 2;
    const y0 = world.bounds.minY;
    this.geo = { world, zones, paths, borders, anchors, boxes, P, x0, y0, h: world.bounds.maxY - y0 };
    return this.geo;
  }

  /**
   * İki komşu bölgenin derin noktaları arasında SU ÜSTÜNDEN giden çizgi
   * (yalnız iki bölgenin hexlerinden BFS). Düz çizgi yarımadaları kesiyordu.
   * Sarmal dünyada x açılır: çizgi dikiş yerinde sıçramaz. Dünya başına önbellek.
   */
  edgeLine(world, a, b) {
    const geo = this.geometry(world);
    geo.edges ??= new Map();
    const key = a < b ? `${a}-${b}` : `${b}-${a}`;
    if (geo.edges.has(key)) return geo.edges.get(key);
    const [from, to] = a < b ? [a, b] : [b, a];
    const start = world.tiles[geo.zones[from].anchor];
    const goal = world.tiles[geo.zones[to].anchor];
    const prev = new Map([[start, null]]);
    const queue = [start];
    for (let head = 0; head < queue.length && !prev.has(goal); head++) {
      const tile = queue[head];
      for (let d = 0; d < 6; d++) {
        const near = world.get(tile.q + DIRS[d][0], tile.r + DIRS[d][1]);
        if (!near || prev.has(near) || (near.seaZone !== from && near.seaZone !== to)) continue;
        prev.set(near, tile);
        queue.push(near);
      }
    }
    let line = null;
    if (prev.has(goal)) {
      const tiles = [];
      for (let t = goal; t; t = prev.get(t)) tiles.push(t);
      tiles.reverse();
      const P = geo.P;
      const pts = [];
      let shift = 0;
      let lastX = null;
      tiles.forEach((tile, index) => {
        if (lastX != null && P) {
          if (tile.x + shift - lastX > P / 2) shift -= P;
          else if (lastX - (tile.x + shift) > P / 2) shift += P;
        }
        lastX = tile.x + shift;
        // Her ikinci hex: basamak kaybolur, Chaikin gerisini yumuşatır.
        if (index % 2 === 0 || index === tiles.length - 1) pts.push(tile.x + shift, tile.y);
      });
      line = chaikin(chaikin(pts));
    }
    geo.edges.set(key, line);
    return line;
  }

  /**
   * Haftalık yol ağı: bölge kenarı başına taşınan yük (altın), oyuncunun
   * yükü mü, kesilen pay. Akış haftada bir değişir: önbellek akışa bağlı.
   */
  laneEdges(world, playerId) {
    const state = world.navyState;
    if (this.lanes?.flows === state?.flows && this.lanes?.player === playerId && this.lanes?.world === world) {
      return this.lanes.edges;
    }
    const edges = new Map();
    for (const lane of seaLaneView(world)) {
      const mine = lane.a === playerId || lane.b === playerId;
      const cut = lane.factor < 0.98;
      for (let i = 1; i < lane.path.length; i++) {
        const a = lane.path[i - 1];
        const b = lane.path[i];
        const key = a < b ? a * 1000 + b : b * 1000 + a;
        const row = edges.get(key) ?? { a: Math.min(a, b), b: Math.max(a, b), value: 0, mine: 0, cut: 0 };
        row.value += lane.value + lane.lost;
        if (mine) row.mine += lane.value + lane.lost;
        if (cut) row.cut += lane.value + lane.lost;
        edges.set(key, row);
      }
    }
    const list = [...edges.values()].sort((x, y) => x.value - y.value);
    this.lanes = { world, flows: state?.flows, player: playerId, edges: list };
    return list;
  }

  /**
   * Seas kipi: deniz ticaret yolları. Kalınlık taşınan yükün karekökü;
   * oyuncunun yükü pirinç, başkalarınınki soluk; kesilen (düşman denizinden
   * ya da denizaltı akınından geçen) yolun üstünde kırmızı kesik çizgi.
   */
  drawLanes(ctx, world, rect, playerId) {
    const edges = this.laneEdges(world, playerId);
    if (!edges.length) return;
    const zoom = this.renderer.camera.zoom;
    const geo = this.geometry(world);
    const shifts = geo.P ? [-geo.P, 0, geo.P] : [0];
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const edge of edges) {
      const line = this.edgeLine(world, edge.a, edge.b);
      if (!line || line.length < 4) continue;
      // Kalınlık ekran pikselidir (zoom'dan bağımsız okunur): ince yol bölge
      // sınırının kesik çizgisiyle karışıyordu.
      const width = Math.min(10, 1.6 + Math.sqrt(edge.value) * 0.7) / zoom;
      const ours = edge.mine > edge.value * 0.25;
      for (const dx of shifts) {
        // Kaba görünürlük: çizginin uçlarından biri ekran çevresindeyse çiz.
        const x1 = line[0] + dx;
        const x2 = line[line.length - 2] + dx;
        if (Math.max(x1, x2) < rect.minX - 200 || Math.min(x1, x2) > rect.maxX + 200) continue;
        ctx.beginPath();
        ctx.moveTo(line[0] + dx, line[1]);
        for (let i = 2; i < line.length; i += 2) ctx.lineTo(line[i] + dx, line[i + 1]);
        ctx.lineWidth = width + 2.4 / zoom;
        ctx.strokeStyle = 'rgba(6, 12, 16, 0.45)';
        ctx.stroke();
        ctx.lineWidth = width;
        ctx.strokeStyle = ours ? 'rgba(240, 208, 128, 0.88)' : 'rgba(226, 214, 186, 0.5)';
        ctx.stroke();
        if (edge.cut > edge.value * 0.2) {
          ctx.setLineDash([7 / zoom, 6 / zoom]);
          ctx.lineWidth = Math.max(1.6 / zoom, width * 0.55);
          ctx.strokeStyle = 'rgba(255, 112, 84, 0.92)';
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }
    }
    ctx.restore();
  }

  /** Yumuşak kıyılı kara (sınır ağı bölgelerinin birleşimi), üç kopya. */
  landPath(world) {
    const renderer = this.renderer;
    const mesh = renderer.borderMeshFor(world);
    if (this.land?.mesh === mesh) return this.land.path;
    const P = world.wrapWidth || 0;
    const path = new Path2D();
    for (const region of mesh.regions) {
      for (const dx of P ? [-P, 0, P] : [0]) {
        for (const loop of renderer.regionLoops(region)) appendLoop(path, loop, dx);
      }
    }
    this.land = { mesh, path };
    return path;
  }

  /** Bölge başına oyuncunun bakışından renk anahtarı (boş deniz null). */
  zoneKeys(world, playerId) {
    const presence = world.navyState?.presence;
    const marks = playerId >= 0 ? seaZoneMarks(world, playerId) : null;
    return this.geometry(world).zones.map((zone) => {
      const here = presence?.get(zone.id);
      if (!here?.size) return null;
      const seen = new Set();
      for (const [nationId] of here) seen.add(relationTo(world, playerId, nationId));
      const friendly = seen.has('ours') || seen.has('ally');
      // Kapalı deniz imzaya girer (':c'): doku yalnız kapalı küme değişince basılır.
      const closed = marks?.get(zone.id)?.closed ? ':c' : '';
      if (friendly && seen.has('enemy')) return `contested${closed}`;
      if (seen.has('enemy')) return `enemy${closed}`;
      if (seen.has('ours')) return 'ours';
      if (seen.has('ally')) return 'ally';
      return 'other';
    });
  }

  /**
   * Bölgeyi kapalı deniz taramasıyla doldurur (doku tuvali, dünya uzayı).
   * Çizgiler bölge kutusunda, bölge yoluyla kırpılır.
   */
  hatchZone(ctx, geo, id, dx, alpha = 1) {
    const box = geo.boxes[id];
    ctx.save();
    ctx.translate(dx, 0);
    ctx.clip(geo.paths[id]);
    ctx.strokeStyle = HATCH.color;
    ctx.globalAlpha = alpha;
    ctx.lineWidth = HATCH.width;
    ctx.beginPath();
    const span = box.maxY - box.minY;
    for (let x = box.minX - span; x < box.maxX; x += HATCH.gap) {
      ctx.moveTo(x, box.maxY);
      ctx.lineTo(x + span, box.minY);
    }
    ctx.stroke();
    ctx.restore();
  }

  texture(world, keys) {
    const geo = this.geometry(world);
    const land = this.landPath(world);
    const sig = keys.join('|');
    if (this.tex?.world === world && this.tex.sig === sig && this.tex.land === land) return this.tex;
    const width = Math.max(1, Math.ceil(geo.P * TINT_SCALE));
    const height = Math.max(1, Math.ceil(geo.h * TINT_SCALE));
    const canvas = this.tex?.canvas ?? document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.setTransform(TINT_SCALE, 0, 0, TINT_SCALE, -geo.x0 * TINT_SCALE, -geo.y0 * TINT_SCALE);
    const shifts = geo.P ? [-geo.P, 0, geo.P] : [0];
    // Ton bulanık basılır (hex basamağı yumuşar); kıyı aşağıda keskin oyulur.
    ctx.filter = 'blur(2px)';
    keys.forEach((key, id) => {
      if (!key) return;
      ctx.fillStyle = SEA_COLORS[key.split(':')[0]];
      for (const dx of shifts) {
        ctx.save();
        ctx.translate(dx, 0);
        ctx.fill(geo.paths[id]);
        ctx.restore();
      }
    });
    ctx.filter = 'none';
    // KAPALI DENİZ (oyuncunun ordusu giremez): çapraz kırmızı tarama, kara
    // oyulmadan önce (kıyıda taşmasın).
    keys.forEach((key, id) => {
      if (!key?.endsWith(':c')) return;
      for (const dx of shifts) this.hatchZone(ctx, geo, id, dx);
    });
    // Deniz haritasının kesik bölge sınırları. Kalınlık dünya pikselidir:
    // doku dörtte bir ölçekte, 3 px'lik çizgi dokuda kayboluyordu.
    ctx.strokeStyle = 'rgba(196, 220, 236, 0.45)';
    ctx.lineWidth = 8;
    ctx.setLineDash([26, 20]);
    for (const dx of shifts) {
      ctx.save();
      ctx.translate(dx, 0);
      ctx.stroke(geo.borders);
      ctx.restore();
    }
    ctx.setLineDash([]);
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fill(land);
    ctx.globalCompositeOperation = 'source-over';
    this.tex = { world, sig, land, canvas };
    return this.tex;
  }

  /** Seas kipi: ton dokusu ve bölge adları (dünya uzayı, kopya başına). */
  drawZones(ctx, world, rect, playerId) {
    const geo = this.geometry(world);
    if (!geo.zones.length) return;
    const tex = this.texture(world, this.zoneKeys(world, playerId));
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    const w = geo.P || tex.canvas.width / TINT_SCALE;
    for (const dx of geo.P ? [-geo.P, 0, geo.P] : [0]) {
      if (geo.x0 + dx > rect.maxX || geo.x0 + dx + w < rect.minX) continue;
      ctx.drawImage(tex.canvas, geo.x0 + dx, geo.y0, w, geo.h);
    }
    ctx.restore();
    // Eğik kamerada ad araziye giydirilmez; renderer.drawMarkers dik basar.
    if (!this.renderer.markPass) this.drawZoneNames(ctx, world, rect, playerId);
  }

  /**
   * Siyasi kiplerde ordu seçiliyken kapalı denizler (§7.2): sefer emri tam
   * o an verilir. Ayrı küçük doku (yalnız kapalı bölgeler, %60 saydam);
   * imzası kapalı küme. Deniz kipinde ana doku zaten tarar.
   */
  drawClosed(ctx, world, rect, playerId) {
    if (playerId < 0) return;
    const marks = seaZoneMarks(world, playerId);
    const closed = [...marks.values()].filter((m) => m.closed).map((m) => m.zone).sort((a, b) => a - b);
    if (!closed.length) return;
    const geo = this.geometry(world);
    const land = this.landPath(world);
    const sig = closed.join(',');
    if (!(this.closedTex?.world === world && this.closedTex.sig === sig && this.closedTex.land === land)) {
      const width = Math.max(1, Math.ceil(geo.P * TINT_SCALE));
      const height = Math.max(1, Math.ceil(geo.h * TINT_SCALE));
      const canvas = this.closedTex?.canvas ?? document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const c = canvas.getContext('2d');
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.clearRect(0, 0, width, height);
      c.setTransform(TINT_SCALE, 0, 0, TINT_SCALE, -geo.x0 * TINT_SCALE, -geo.y0 * TINT_SCALE);
      const shifts = geo.P ? [-geo.P, 0, geo.P] : [0];
      for (const id of closed) {
        for (const dx of shifts) {
          c.save();
          c.translate(dx, 0);
          c.fillStyle = 'rgba(214, 74, 58, 0.12)';
          c.fill(geo.paths[id]);
          c.restore();
          this.hatchZone(c, geo, id, dx, 0.6);
        }
      }
      c.globalCompositeOperation = 'destination-out';
      c.fill(land);
      c.globalCompositeOperation = 'source-over';
      this.closedTex = { world, sig, land, canvas };
    }
    const w = geo.P || this.closedTex.canvas.width / TINT_SCALE;
    for (const dx of geo.P ? [-geo.P, 0, geo.P] : [0]) {
      if (geo.x0 + dx > rect.maxX || geo.x0 + dx + w < rect.minX) continue;
      ctx.drawImage(this.closedTex.canvas, geo.x0 + dx, geo.y0, w, geo.h);
    }
    if (this.renderer.markPass) return;
    const zoom = this.renderer.camera.zoom;
    ctx.save();
    ctx.font = MARK_FONT.closed(zoom);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    for (const id of closed) {
      const anchor = geo.anchors[id];
      for (const dx of copiesIn(anchor.x, anchor.y, rect, geo.P)) {
        this.closedTag(ctx, anchor.x + dx, anchor.y - MARK.closedRise / zoom, zoom);
      }
    }
    ctx.restore();
  }

  /** "CLOSED TO OUR TROOPS" etiketi (dünya uzayı). */
  closedTag(ctx, x, y, zoom) {
    ctx.lineWidth = 3 / zoom;
    ctx.strokeStyle = 'rgba(6, 12, 16, 0.9)';
    ctx.fillStyle = '#ff8f6e';
    ctx.strokeText(CLOSED_TEXT, x, y);
    ctx.fillText(CLOSED_TEXT, x, y);
  }

  /** Bölge adları (ve paneldeki satırın halkası), derin noktada. */
  drawZoneNames(ctx, world, rect, playerId = -1) {
    const geo = this.geometry(world);
    if (!geo.zones.length) return;
    const U = this.renderer.upright;
    const zoom = this.renderer.camera.zoom;
    ctx.save();
    ctx.font = MARK_FONT.name(zoom);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 3 / zoom;
    ctx.strokeStyle = 'rgba(6, 12, 16, 0.85)';
    ctx.fillStyle = 'rgba(214, 232, 244, 0.9)';
    const marks = playerId >= 0 ? seaZoneMarks(world, playerId) : new Map();
    const closed = new Set([...marks.values()].filter((m) => m.closed).map((m) => m.zone));
    geo.zones.forEach((zone, id) => {
      const anchor = geo.anchors[id];
      for (const dx of copiesIn(anchor.x, anchor.y, rect, geo.P)) {
        const at = { x: anchor.x + dx, y: anchor.y };
        if (U && !U.pin(ctx, at.x, at.y)) continue;
        const lit = id === this.highlight;
        ctx.lineWidth = 3 / zoom;
        ctx.strokeStyle = 'rgba(6, 12, 16, 0.85)';
        ctx.fillStyle = lit ? '#f0d795' : 'rgba(214, 232, 244, 0.9)';
        ctx.strokeText(zone.name, at.x, at.y - 6 / zoom);
        ctx.fillText(zone.name, at.x, at.y - 6 / zoom);
        if (closed.has(id)) {
          ctx.save();
          ctx.font = MARK_FONT.closed(zoom);
          ctx.textBaseline = 'middle';
          this.closedTag(ctx, at.x, at.y - MARK.closedRise / zoom, zoom);
          ctx.restore();
        }
        if (lit) {
          // Paneldeki satırın bölgesi: derin noktada pirinç halka.
          ctx.save();
          ctx.strokeStyle = 'rgba(240, 215, 149, 0.9)';
          ctx.lineWidth = 2 / zoom;
          ctx.setLineDash([6 / zoom, 4 / zoom]);
          ctx.beginPath();
          ctx.arc(at.x, at.y + 11 / zoom, 34 / zoom, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }
      }
    });
    ctx.restore();
  }

  /**
   * Filo işaretleri: bölgenin derin noktasında ulus başına bayrak + gemi
   * sayısı. Seas kipinde herkes, öteki kiplerde yalnız bizim, müttefik ve
   * düşman filolar (barışın yabancı filosu haritayı kalabalıklaştırır).
   */
  drawFleets(ctx, world, rect, playerId, everyone = false) {
    const state = world.navyState;
    const ours = this.ourCounters(world, playerId);
    if (!state?.presence?.size && !state?.subs?.size && !ours.size) return;
    const geo = this.geometry(world);
    const zoom = this.renderer.camera.zoom;
    const U = this.renderer.upright;
    ctx.save();
    ctx.font = MARK_FONT.badge(zoom);
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    // Satır: önce bizim filo sayaçlarımız, sonra öteki ulusların rozetleri.
    for (const zoneId of this.rowZones(world, playerId, everyone, ours)) {
      const anchor = geo.anchors[zoneId];
      if (!anchor) continue;
      const row = this.zoneRow(world, playerId, zoneId, zoom, everyone, ours);
      if (!row.counters.length && !row.badges.length) continue;
      for (const dx of copiesIn(anchor.x, anchor.y, rect, geo.P)) {
        if (U && !U.pin(ctx, anchor.x + dx, anchor.y)) continue;
        const left = anchor.x + dx - row.total / 2 / zoom;
        const top = anchor.y + MARK.badgeTop / zoom;
        for (const item of row.counters) {
          this.counter(ctx, world, left + item.x / zoom, top, item, zoom, playerId);
        }
        if (row.badges.length) {
          ctx.font = MARK_FONT.badge(zoom);
          ctx.textBaseline = 'middle';
          ctx.textAlign = 'left';
          const cx = left + (row.badgeX + row.badgeW / 2) / zoom;
          const y = top + (row.h - MARK.badgeH) / 2 / zoom;
          this.badges(ctx, world, cx, y, row.badges, { zoom, sub: false });
        }
      }
    }
    // Denizaltılar: filo satırının altında kesik kenarlı kapsül, "U" + sayı.
    // Seas kipinde herkesinki, öteki kiplerde yalnız bizim ve düşmanınki.
    for (const [zoneId, here] of state?.subs ?? []) {
      const anchor = geo.anchors[zoneId];
      if (!anchor) continue;
      const rows = fleetRows(world, playerId, here, (row) => everyone || row.rel === 'ours' || row.rel === 'enemy');
      if (!rows.length) continue;
      const rowH = this.rowHeight(world, playerId, zoneId, everyone, ours);
      for (const dx of copiesIn(anchor.x, anchor.y, rect, geo.P)) {
        if (U && !U.pin(ctx, anchor.x + dx, anchor.y)) continue;
        ctx.font = MARK_FONT.badge(zoom);
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'left';
        const y = anchor.y + (MARK.badgeTop + (rowH ? rowH + MARK.rowGap : 0)) / zoom;
        this.badges(ctx, world, anchor.x + dx, y, rows, { zoom, sub: true });
      }
    }
    this.drawFleetOrders(ctx, world, rect, playerId, ours);
    for (const mark of this.recentMarks(world, playerId, everyone)) {
      const anchor = geo.anchors[mark.zone];
      for (const dx of copiesIn(anchor.x, anchor.y, rect, geo.P)) {
        if (U && !U.pin(ctx, anchor.x + dx, anchor.y)) continue;
        const at = this.markAt(ctx, world, mark.zone, anchor.x + dx, anchor.y, zoom);
        if (mark.kind === 'battle') this.battleMark(ctx, at.x, at.y, zoom, mark);
        else this.evasionMark(ctx, at.x, at.y, zoom, mark);
      }
    }
    ctx.restore();
  }

  /** Oyuncunun filoları, bölge başına (fleetMarks; hafta ve emir başına bir kez). */
  ourCounters(world, playerId) {
    const turn = world.turn ?? 0;
    const nation = playerId >= 0 ? world.nations[playerId] : null;
    const key = `${turn}:${playerId}:${this.fleetStamp ?? 0}`;
    if (this.countersCache?.world === world && this.countersCache.key === key) return this.countersCache.map;
    const map = new Map();
    for (const mark of nation ? fleetMarks(world, nation) : []) {
      if (!map.has(mark.zone)) map.set(mark.zone, []);
      map.get(mark.zone).push(mark);
    }
    this.countersCache = { world, key, map };
    return map;
  }

  /** Filo emri, bölünme ya da birleşme: sayaç önbelleği hafta içinde de tazelenir. */
  touchFleets() {
    this.fleetStamp = (this.fleetStamp ?? 0) + 1;
  }

  /** Satırı olan bölgeler: bizim sayacımız ya da (kipe göre) başkasının filosu. */
  rowZones(world, playerId, everyone, ours) {
    const zones = new Set(ours.keys());
    for (const [zoneId, here] of world.navyState?.presence ?? []) {
      if (fleetRows(world, playerId, here, (row) => row.rel !== 'ours' && (everyone || row.rel !== 'other')).length) zones.add(zoneId);
    }
    return [...zones].sort((a, b) => a - b);
  }

  /** Satırın yüksekliği (ekran px): sayaç varsa sayacın, yoksa rozetin; satır yoksa 0. */
  rowHeight(world, playerId, zoneId, everyone, ours = this.ourCounters(world, playerId)) {
    if (ours.get(zoneId)?.length) return COUNTER.h;
    const here = world.navyState?.presence?.get(zoneId);
    if (!here) return 0;
    return fleetRows(world, playerId, here, (row) => row.rel !== 'ours' && (everyone || row.rel !== 'other')).length ? MARK.badgeH : 0;
  }

  /**
   * Bölge satırının yerleşimi (ekran px, satırın sol ucundan): sayaçlar ve
   * rozetler. Çizim, tıklama (fleetAt) ve levha engeli (markBoxes) bunu okur.
   */
  zoneRow(world, playerId, zoneId, zoom, everyone, ours = this.ourCounters(world, playerId)) {
    const ctx = this.meter();
    const turn = world.turn ?? 0;
    const counters = [];
    let x = 0;
    for (const mark of ours.get(zoneId) ?? []) {
      const name = zoom >= COUNTER.nameZoom ? mark.name : '';
      const left = mark.eta != null ? Math.max(0, mark.eta - turn) : null;
      const tail = mark.state === 'underway' && left != null
        ? (left > 0 ? `${left} wk` : 'this wk') : mark.state === 'port' ? 'in port' : '';
      ctx.font = COUNTER_FONT.count;
      const cw = ctx.measureText(String(mark.count)).width;
      ctx.font = COUNTER_FONT.name;
      const nw = name ? ctx.measureText(name).width : 0;
      const tw = tail ? ctx.measureText(tail).width : 0;
      const w = COUNTER.pad + COUNTER.flagW + COUNTER.gap + COUNTER.ship + 3 + cw
        + (nw ? COUNTER.gap + 2 + nw : 0) + (tw ? COUNTER.gap + 2 + tw : 0) + COUNTER.pad;
      counters.push({ mark, name, tail, cw, nw, tw, x, w });
      x += w + COUNTER.gapItems;
    }
    const here = world.navyState?.presence?.get(zoneId);
    const badges = here ? fleetRows(world, playerId, here, (row) => row.rel !== 'ours' && (everyone || row.rel !== 'other')) : [];
    let badgeW = 0;
    if (badges.length) {
      ctx.font = MARK_FONT.badge(1);
      badgeW = badgeLayout((text) => ctx.measureText(text).width, badges, false, 1).total;
    }
    const total = x + badgeW - (counters.length && !badges.length ? COUNTER.gapItems : 0);
    return { counters, badges, badgeX: x, badgeW, total, h: counters.length ? COUNTER.h : MARK.badgeH };
  }

  /** Tek filo sayacı: emrin şeridi, bayrak, gövde, sayı, (yakında) ad ve yol/liman eki. */
  counter(ctx, world, x, y, item, zoom, playerId) {
    const { mark } = item;
    const z = 1 / zoom;
    const h = COUNTER.h * z;
    const w = item.w * z;
    const color = MODE_COLORS[mark.mode] ?? MODE_COLORS.auto;
    const selected = this.selectedFleet === mark.id;
    ctx.save();
    if (mark.state === 'port') ctx.globalAlpha *= 0.85;
    if (selected) {
      // Seçili: dışta pirinç ışık (tek seferlik; canlandırma yok).
      ctx.shadowColor = 'rgba(255, 214, 120, 0.85)';
      ctx.shadowBlur = 10;
    }
    ctx.fillStyle = selected ? 'rgba(34, 30, 18, 0.96)' : 'rgba(8, 14, 18, 0.92)';
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 3 * z);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = selected ? '#ffe39a' : color;
    ctx.lineWidth = (selected ? 2.2 : 1.4) * z;
    if (mark.state === 'underway') ctx.setLineDash([4 * z, 2.5 * z]);
    ctx.stroke();
    ctx.setLineDash([]);
    // Emrin şeridi: solda dikey renk çubuğu (Auto / deniz / liman).
    ctx.fillStyle = color;
    ctx.fillRect(x + 1.4 * z, y + 3 * z, 2.2 * z, h - 6 * z);
    let cx = x + COUNTER.pad * z;
    const flag = world.nations[playerId]?.flag;
    if (flag) {
      ctx.save();
      ctx.translate(cx, y + (h - COUNTER.flagH * z) / 2);
      drawFlag(ctx, flag, 0, 0, COUNTER.flagW * z, COUNTER.flagH * z);
      ctx.restore();
    }
    cx += (COUNTER.flagW + COUNTER.gap) * z;
    ctx.save();
    ctx.translate(cx, y + (h - 10 * z) / 2);
    ctx.scale(z, z);
    ctx.fillStyle = color;
    ctx.fill(hullPath());
    ctx.restore();
    cx += (COUNTER.ship + 3) * z;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.font = `700 ${12.5 * z}px ${FONT_UI}`;
    ctx.fillStyle = '#f2ead6';
    ctx.fillText(String(mark.count), cx, y + h / 2 + 0.5 * z);
    cx += item.cw * z;
    ctx.font = `600 ${12 * z}px ${FONT_UI}`;
    if (item.name) {
      cx += (COUNTER.gap + 2) * z;
      ctx.fillStyle = selected ? '#ffe39a' : '#d8d0bd';
      ctx.fillText(item.name, cx, y + h / 2 + 0.5 * z);
      cx += item.nw * z;
    }
    if (item.tail) {
      cx += (COUNTER.gap + 2) * z;
      ctx.fillStyle = mark.state === 'port' ? '#aab4bd' : ROUTE_COLOR;
      ctx.fillText(item.tail, cx, y + h / 2 + 0.5 * z);
    }
    ctx.restore();
  }

  /**
   * Ekran noktasındaki oyuncu filosu (game.handleTap): sayacın kutusu
   * zoneRow'dan, bölge çapası kameradan. Kimlik döner (0 = sanal Home Fleet).
   */
  fleetAt(world, playerId, sx, sy) {
    if (!world || playerId < 0) return null;
    const camera = this.renderer.camera;
    if (!camera?.worldToScreenNear) return null;
    const ours = this.ourCounters(world, playerId);
    if (!ours.size) return null;
    const geo = this.geometry(world);
    const everyone = this.renderer.mapMode === 'seas';
    for (const [zoneId] of ours) {
      const anchor = geo.anchors[zoneId];
      if (!anchor) continue;
      const p = camera.worldToScreenNear(anchor.x, anchor.y, sx);
      const row = this.zoneRow(world, playerId, zoneId, camera.zoom, everyone, ours);
      const left = p.x - row.total / 2;
      const top = p.y + MARK.badgeTop;
      if (sy < top - 3 || sy > top + row.h + 3) continue;
      for (const item of row.counters) {
        if (sx >= left + item.x - 2 && sx <= left + item.x + item.w + 2) return item.mark.id;
      }
    }
    return null;
  }

  /**
   * Filoların emirleri haritada: deniz emri olan filonun bulunduğu yerden
   * hedefine yeşil kesik yol ve hedefte halka (emir verildi, gemiler hafta
   * sonunda çıkar); seçili filo varken imlecin altındaki deniz ("buraya").
   */
  drawFleetOrders(ctx, world, rect, playerId, ours) {
    const geo = this.geometry(world);
    const zoom = this.renderer.camera.zoom;
    const U = this.renderer.upright;
    ctx.save();
    for (const list of ours.values()) {
      for (const mark of list) {
        if (mark.mode !== 'sea' || mark.target == null || !geo.anchors[mark.target]) continue;
        const selected = this.selectedFleet === mark.id;
        // Yol yalnız düz kamerada (eğik kamerada dik geçiş zemine çizgi yatıramaz).
        if (mark.target !== mark.zone && !U) {
          const pts = this.routePoints(world, mark.zone, mark.target);
          if (pts) this.strokeRoute(ctx, world, pts, rect, zoom, MODE_COLORS.sea, selected ? 3.2 : 2.2);
        }
        if (selected || mark.target !== mark.zone) {
          const anchor = geo.anchors[mark.target];
          for (const dx of copiesIn(anchor.x, anchor.y, rect, geo.P, 60 / zoom)) {
            if (U && !U.pin(ctx, anchor.x + dx, anchor.y)) continue;
            this.targetRing(ctx, anchor.x + dx, anchor.y, zoom, MODE_COLORS.sea);
          }
        }
      }
    }
    if (this.selectedFleet != null && this.hoverZone != null && geo.anchors[this.hoverZone]) {
      const anchor = geo.anchors[this.hoverZone];
      for (const dx of copiesIn(anchor.x, anchor.y, rect, geo.P, 60 / zoom)) {
        if (U && !U.pin(ctx, anchor.x + dx, anchor.y)) continue;
        this.targetRing(ctx, anchor.x + dx, anchor.y, zoom, '#ffe39a', 'Right-click: send the fleet here');
      }
    }
    ctx.restore();
  }

  /** Hedef halkası (kesik, bölge çapasının çevresinde) ve isteğe bağlı etiket. */
  targetRing(ctx, x, y, zoom, color, label = null) {
    const z = 1 / zoom;
    ctx.save();
    ctx.strokeStyle = 'rgba(6, 12, 16, 0.75)';
    ctx.lineWidth = 4.5 * z;
    ctx.setLineDash([7 * z, 5 * z]);
    ctx.beginPath();
    ctx.arc(x, y + 12 * z, 40 * z, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.2 * z;
    ctx.stroke();
    ctx.setLineDash([]);
    if (label) {
      ctx.font = `600 ${12 * z}px ${FONT_UI}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.lineJoin = 'round';
      ctx.lineWidth = 3 * z;
      ctx.strokeStyle = 'rgba(6, 12, 16, 0.9)';
      ctx.strokeText(label, x, y + 56 * z);
      ctx.fillStyle = color;
      ctx.fillText(label, x, y + 56 * z);
    }
    ctx.restore();
  }

  /** İki bölge arasında su üstünden yol noktaları (dünya, sarmal açılmış). */
  routePoints(world, from, to) {
    const geo = this.geometry(world);
    const route = this.zoneRoute(world, from, to);
    if (!route || route.length < 2) return null;
    const pts = [];
    let shift = 0;
    for (let i = 1; i < route.length; i++) {
      const line = this.edgeLine(world, route[i - 1], route[i]);
      if (!line || line.length < 4) continue;
      // edgeLine küçükten büyüğe çizilir: yön ters ise çevir.
      const forward = route[i - 1] < route[i];
      const seg = [];
      for (let k = 0; k < line.length; k += 2) seg.push([line[k], line[k + 1]]);
      if (!forward) seg.reverse();
      for (const [x, y] of seg) {
        if (pts.length && geo.P) {
          const lastX = pts[pts.length - 1][0];
          if (x + shift - lastX > geo.P / 2) shift -= geo.P;
          else if (lastX - (x + shift) > geo.P / 2) shift += geo.P;
        }
        pts.push([x + shift, y]);
      }
    }
    return pts.length >= 2 ? pts : null;
  }

  /** Kesik rota çizgisi ve hedefte ok ucu (her sarmal kopyada). */
  strokeRoute(ctx, world, pts, rect, zoom, color, width = 3) {
    const P = this.geometry(world).P;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const dx of P ? [-P, 0, P] : [0]) {
      const xs = pts.map((p) => p[0] + dx);
      if (Math.max(...xs) < rect.minX - 200 || Math.min(...xs) > rect.maxX + 200) continue;
      ctx.beginPath();
      ctx.moveTo(pts[0][0] + dx, pts[0][1]);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0] + dx, pts[i][1]);
      ctx.setLineDash([10 / zoom, 6 / zoom]);
      ctx.lineWidth = (width + 2.4) / zoom;
      ctx.strokeStyle = 'rgba(6, 12, 16, 0.55)';
      ctx.stroke();
      ctx.lineWidth = width / zoom;
      ctx.strokeStyle = color;
      ctx.stroke();
      ctx.setLineDash([]);
      const [x1, y1] = pts[pts.length - 1];
      const [x0, y0] = pts[Math.max(0, pts.length - 3)];
      const a = Math.atan2(y1 - y0, x1 - x0);
      const L = 11 / zoom;
      ctx.beginPath();
      ctx.moveTo(x1 + dx, y1);
      ctx.lineTo(x1 + dx - L * Math.cos(a - 0.45), y1 - L * Math.sin(a - 0.45));
      ctx.lineTo(x1 + dx - L * Math.cos(a + 0.45), y1 - L * Math.sin(a + 0.45));
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
    }
    ctx.restore();
  }

  /**
   * Son iki haftanın deniz muharebeleri ve kaçınmaları, bölge başına bir:
   * bölge adının solunda disk. Bizimki sonuca göre renkli (yeşil zafer,
   * kırmızı yenilgi), başkalarınınki gri (yalnız deniz kipinde); yakın
   * zoomda etiket. Çizim ve levha engeli (markBoxes) aynı listeyi okur.
   */
  recentMarks(world, playerId, everyone) {
    const state = world.navyState;
    const anchors = this.geometry(world).anchors;
    const turn = world.turn ?? 0;
    const marks = playerId >= 0 ? seaZoneMarks(world, playerId) : new Map();
    const out = [];
    const placed = new Set();
    for (const report of [...(state?.reports ?? [])].reverse()) {
      if (turn - report.turn > BATTLE_MARK_WEEKS || placed.has(report.zone)) continue;
      if (!anchors[report.zone]) continue;
      const mine = playerId >= 0 && report.sides.some((side) => side.nations.includes(playerId));
      if (!everyone && !mine) continue;
      placed.add(report.zone);
      const own = mine ? marks.get(report.zone)?.battle : null;
      out.push({
        kind: 'battle',
        zone: report.zone,
        tone: own ? (own.won ? MARK_COLORS.ours : MARK_COLORS.enemy) : MARK_COLORS.other,
        label: own ? `${own.won ? 'Victory' : 'Defeat'}${own.won && own.sunk ? ` · ${own.sunk} sunk` : ''}${!own.won && own.lost ? ` · ${own.lost} lost` : ''}` : null,
        fresh: report.turn === turn,
      });
    }
    for (const [zoneId, mark] of marks) {
      if (!mark.evaded || placed.has(zoneId)) continue;
      if (!anchors[zoneId]) continue;
      placed.add(zoneId);
      const us = mark.evaded.us;
      out.push({ kind: 'evasion', zone: zoneId, us, label: us ? 'refused' : 'they refused', fresh: mark.evaded.turn === turn });
    }
    return out;
  }

  /**
   * İşaret yeri: bölge adının solu (ad derin noktanın üstünde ortalı). Eski
   * yer adın üstüne biniyordu. Ad genişliği bölge başına önbellekte.
   */
  markAt(ctx, world, zoneId, x, y, zoom) {
    const off = this.markOffset(world, zoneId, ctx);
    return { x: x + off.x / zoom, y: y + off.y / zoom };
  }

  /** İşaret diskinin merkezi, bölge çapasına göre ekran px. */
  markOffset(world, zoneId, ctx = this.meter()) {
    const geo = this.geometry(world);
    geo.nameW ??= new Map();
    if (!geo.nameW.has(zoneId)) {
      ctx.save();
      ctx.font = MARK_FONT.name(1);
      geo.nameW.set(zoneId, ctx.measureText(geo.zones[zoneId]?.name ?? '').width);
      ctx.restore();
    }
    return { x: -(geo.nameW.get(zoneId) / 2 + 12), y: -12 };
  }

  /**
   * DENİZ KİPİ BİLGİSİ (filo rozetlerinin altında, satır satır): yoldaki
   * gemilerimizin hayalet rozeti (+3 · 2 wk) ve abluka hapları (bize karşı
   * kırmızı, bizimki yeşil). Sayılar seaZoneMarks'tan; burada hesap yok.
   */
  drawSeaInfo(ctx, world, rect, playerId) {
    if (playerId < 0) return;
    const geo = this.geometry(world);
    const marks = seaZoneMarks(world, playerId);
    if (!marks.size) return;
    const zoom = this.renderer.camera.zoom;
    const U = this.renderer.upright;
    ctx.save();
    ctx.font = MARK_FONT.pill(zoom);
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    for (const [zoneId, mark] of marks) {
      const anchor = geo.anchors[zoneId];
      if (!anchor) continue;
      const { pills, top } = this.seaInfoPills(world, zoneId, mark, zoom, playerId);
      if (!pills.length) continue;
      for (const dx of copiesIn(anchor.x, anchor.y, rect, geo.P)) {
        if (U && !U.pin(ctx, anchor.x + dx, anchor.y)) continue;
        let y = anchor.y + top / zoom;
        for (const pill of pills) {
          this.pill(ctx, world, anchor.x + dx, y, pill, zoom, playerId);
          y += MARK.pillStep / zoom;
        }
      }
    }
    ctx.restore();
  }

  /** Yazı ölçmek için çizilmeyen küçük tuval (markBoxes kare dışında da ölçer). */
  meter() {
    this.meterCtx ??= document.createElement('canvas').getContext('2d');
    return this.meterCtx;
  }

  /**
   * ÇİZİLEN deniz işaretlerinin kutuları — cephe levhaları bunları örtmez.
   * Her kutu: tür, bölge çapası (dünya) + çapaya göre ekran px ofseti ve ölçüsü
   * (işaretler zoomdan bağımsız ekran ölçüsündedir). Yerleşim çizimin kendi
   * yardımcılarından (badgeLayout, seaInfoPills, recentMarks, markOffset)
   * okunur; kipler renderer'daki gibi: `seas` herkesin filosu + haplar +
   * kapalı deniz yazısı, `closed` siyasi kipte ordu seçiliyken kapalı deniz
   * yazısı.
   */
  markBoxes(world, playerId, { seas = false, closed = false, zoom = 1 } = {}) {
    const out = [];
    const state = world.navyState;
    if (!state) return out;
    const geo = this.geometry(world);
    const ctx = this.meter();
    const measure = (text) => ctx.measureText(text).width;
    const box = (kind, zoneId, dx, dy, w, h) => {
      const anchor = geo.anchors[zoneId];
      if (anchor) out.push({ kind, x: anchor.x, y: anchor.y, dx, dy, w, h });
    };
    // drawFleets ile aynı kapı: hiç filo yoksa disk de çizilmez.
    const ours = this.ourCounters(world, playerId);
    if (state.presence?.size || state.subs?.size || ours.size) {
      for (const zoneId of this.rowZones(world, playerId, seas, ours)) {
        const row = this.zoneRow(world, playerId, zoneId, zoom, seas, ours);
        if (!row.counters.length && !row.badges.length) continue;
        box('fleet', zoneId, -row.total / 2, MARK.badgeTop, row.total, row.h);
      }
      ctx.font = MARK_FONT.badge(1);
      for (const [zoneId, here] of state.subs ?? []) {
        const rows = fleetRows(world, playerId, here, (row) => seas || row.rel === 'ours' || row.rel === 'enemy');
        if (!rows.length) continue;
        const { total } = badgeLayout(measure, rows, true, 1);
        const rowH = this.rowHeight(world, playerId, zoneId, seas, ours);
        box('subs', zoneId, -total / 2, MARK.badgeTop + (rowH ? rowH + MARK.rowGap : 0), total, MARK.subH);
      }
      ctx.font = MARK_FONT.label(1);
      for (const mark of this.recentMarks(world, playerId, seas)) {
        const at = this.markOffset(world, mark.zone, ctx);
        const r = mark.fresh ? MARK.discFresh : MARK.disc;
        const label = mark.label && zoom >= LABEL_ZOOM ? measure(mark.label) + MARK.labelGap : 0;
        // Etiket 12 px; kutu diskin ve yazının yüksekliğinin büyüğü.
        const h = Math.max(r * 2, 16);
        box(mark.kind, mark.zone, at.x - r - label, at.y - h / 2, r * 2 + label, h);
      }
    }
    if (playerId >= 0 && (seas || closed)) {
      const marks = seaZoneMarks(world, playerId);
      ctx.font = MARK_FONT.closed(1);
      const tag = measure(CLOSED_TEXT);
      for (const [zoneId, mark] of marks) {
        if (mark.closed) box('closed', zoneId, -tag / 2, -MARK.closedRise - 8, tag, 16);
      }
      if (seas) {
        ctx.font = MARK_FONT.pill(1);
        for (const [zoneId, mark] of marks) {
          const { pills, top } = this.seaInfoPills(world, zoneId, mark, zoom, playerId);
          pills.forEach((pill, index) => {
            const w = pillWidth(measure, pill, 1);
            box('pill', zoneId, -w / 2, top + index * MARK.pillStep, w, MARK.pillH);
          });
        }
      }
    }
    return out;
  }

  /** Bölgenin hapları ve ilk hapın çapadan uzaklığı (ekran px). */
  seaInfoPills(world, zoneId, mark, zoom, playerId = -1) {
    const state = world.navyState;
    const pills = [];
    // Yoldaki gemilerimiz artık filonun sayacıdır (kesik çerçeve + "2 wk"):
    // ayrıca "+3 · 2 wk" hapı aynı şeyi ikinci kez söylüyordu.
    if (zoom >= 0.35) {
      if (mark.onUs > 0.01) pills.push({ text: `Blockading us ${Math.round(mark.onUs * 100)}%`, color: MARK_COLORS.enemy });
      const byUs = [...mark.byUs].sort((a, b) => b.share - a.share);
      for (const row of byUs.slice(0, mark.onUs > 0.01 ? 1 : 2)) {
        pills.push({ text: `We blockade ${world.nations[row.nation]?.name ?? '?'} ${Math.round(row.share * 100)}%`, color: MARK_COLORS.ours });
      }
      if (byUs.length > (mark.onUs > 0.01 ? 1 : 2)) pills.push({ text: `+${byUs.length - (mark.onUs > 0.01 ? 1 : 2)}`, color: MARK_COLORS.ours });
    }
    // Rozet satırlarının altından başla: filo (sayaç ya da rozet) ve denizaltı satırı.
    let top = MARK.badgeTop;
    const rowH = this.rowHeight(world, playerId, zoneId, true);
    if (rowH) top += rowH + MARK.rowGap;
    if (state?.subs?.get(zoneId)?.size) top += MARK.subH + MARK.rowGap;
    return { pills, top };
  }

  /** Koyu kapsül içinde tek satır (ortalı). Hayalet rozet kesik kenarlı, bayraklı. */
  pill(ctx, world, cx, y, pill, zoom, playerId) {
    const pad = MARK.pillPad / zoom;
    const h = MARK.pillH / zoom;
    const flagW = pill.flag ? MARK.pillFlagW / zoom : 0;
    const w = pillWidth((text) => ctx.measureText(text).width, pill, zoom);
    const x = cx - w / 2;
    ctx.fillStyle = 'rgba(8, 14, 18, 0.86)';
    ctx.strokeStyle = pill.color;
    ctx.lineWidth = 1.2 / zoom;
    if (pill.dash) ctx.setLineDash([3 / zoom, 2 / zoom]);
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 2.5 / zoom);
    ctx.fill();
    ctx.stroke();
    if (pill.dash) ctx.setLineDash([]);
    let tx = x + pad;
    const flag = pill.flag ? world.nations[playerId]?.flag : null;
    if (flag) {
      ctx.save();
      ctx.globalAlpha = 0.7;
      ctx.translate(tx, y + (h - 10 / zoom) / 2);
      drawFlag(ctx, flag, 0, 0, flagW, 10 / zoom);
      ctx.restore();
      tx += flagW + pad;
    }
    ctx.fillStyle = pill.color;
    ctx.fillText(pill.text, tx, y + h / 2 + 0.5 / zoom);
  }

  /**
   * Yoldaki gemilerimiz (NAVY-11): çıkış denizinden hedefe su üstünden kesik
   * pirinç çizgi ve ok ucu. Bölge yolu komşuluk grafında BFS; parçalar
   * edgeLine (ticaret yollarıyla aynı çizgi). Yalnız deniz kipi.
   */
  drawUnderway(ctx, world, rect, playerId) {
    if (playerId < 0) return;
    const marks = seaZoneMarks(world, playerId);
    const zoom = this.renderer.camera.zoom;
    for (const [zoneId, mark] of marks) {
      for (const row of mark.underway) {
        if (!(row.from >= 0) || row.from === zoneId) continue;
        const pts = this.routePoints(world, row.from, zoneId);
        if (pts) this.strokeRoute(ctx, world, pts, rect, zoom, ROUTE_COLOR, 3);
      }
    }
  }

  /** İki bölge arasında komşuluk grafında en kısa bölge dizisi (BFS, önbellekli). */
  zoneRoute(world, from, to) {
    const geo = this.geometry(world);
    geo.routes ??= new Map();
    const key = `${from}>${to}`;
    if (geo.routes.has(key)) return geo.routes.get(key);
    const prev = new Map([[from, -1]]);
    const queue = [from];
    for (let head = 0; head < queue.length && !prev.has(to); head++) {
      for (const next of geo.zones[queue[head]].neighbors) {
        if (prev.has(next)) continue;
        prev.set(next, queue[head]);
        queue.push(next);
      }
    }
    let route = null;
    if (prev.has(to)) {
      route = [];
      for (let z = to; z >= 0; z = prev.get(z)) route.push(z);
      route.reverse();
    }
    geo.routes.set(key, route);
    return route;
  }

  /** Ulus başına bayrak + sayı rozetleri, ortalı tek satır. */
  badges(ctx, world, cx, y, rows, { zoom, sub }) {
    const { pad, flagW, texts, widths, total } = badgeLayout((text) => ctx.measureText(text).width, rows, sub, zoom);
    const flagH = (sub ? 8 : 10) / zoom;
    const h = (sub ? MARK.subH : MARK.badgeH) / zoom;
    let x = cx - total / 2;
    rows.forEach((row, index) => {
      const w = widths[index];
      ctx.fillStyle = sub ? 'rgba(4, 8, 10, 0.92)' : 'rgba(8, 14, 18, 0.88)';
      ctx.strokeStyle = MARK_COLORS[row.rel];
      ctx.lineWidth = (sub ? 1 : 1.2) / zoom;
      if (sub) ctx.setLineDash([3 / zoom, 2 / zoom]);
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, sub ? h / 2 : 2.5 / zoom);
      ctx.fill();
      ctx.stroke();
      if (sub) ctx.setLineDash([]);
      const nation = world.nations[row.nationId];
      if (nation?.flag) {
        ctx.save();
        ctx.translate(x + pad * (sub ? 1.5 : 1), y + (h - flagH) / 2);
        drawFlag(ctx, nation.flag, 0, 0, flagW, flagH);
        ctx.restore();
      }
      ctx.fillStyle = MARK_COLORS[row.rel];
      ctx.fillText(texts[index], x + pad * 2 + flagW, y + h / 2 + 0.5 / zoom);
      x += w + pad;
    });
  }

  /**
   * Muharebe diski (çapraz kılıç). Yeni işaret ilk haftasında 1.25 ölçekle
   * çizilir (tek seferlik; sürekli canlandırma yok, CLAUDE.md).
   */
  battleMark(ctx, cx, cy, zoom, { tone = '#ff8f6e', label = null, fresh = false } = {}) {
    const r = (fresh ? MARK.discFresh : MARK.disc) / zoom;
    ctx.save();
    ctx.fillStyle = 'rgba(30, 6, 4, 0.85)';
    ctx.strokeStyle = tone;
    ctx.lineWidth = 1.6 / zoom;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.5, cy - r * 0.5);
    ctx.lineTo(cx + r * 0.5, cy + r * 0.5);
    ctx.moveTo(cx + r * 0.5, cy - r * 0.5);
    ctx.lineTo(cx - r * 0.5, cy + r * 0.5);
    ctx.stroke();
    if (label && zoom >= LABEL_ZOOM) this.markLabel(ctx, cx - r - MARK.labelGap / zoom, cy, label, tone, zoom);
    ctx.restore();
  }

  /** Kaçınma diski: gri, "↩"; etiket "refused" (biz) / "they refused". */
  evasionMark(ctx, cx, cy, zoom, { us, fresh }) {
    const r = (fresh ? MARK.discFresh : MARK.disc) / zoom;
    const tone = us ? '#c9c2b0' : MARK_COLORS.ours;
    ctx.save();
    ctx.fillStyle = 'rgba(10, 14, 18, 0.88)';
    ctx.strokeStyle = tone;
    ctx.lineWidth = 1.4 / zoom;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // Dönüş oku yol olarak çizilir (ui/icons/glyphs.js 'return' ile aynı):
    // '↩' karakteri Windows'ta emoji fontundan renkli gelebiliyordu.
    const k = (r * 1.25) / 24;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(k, k);
    ctx.translate(-11.75, -14);
    ctx.lineWidth = 2.6 / zoom / k;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke(returnPath());
    ctx.restore();
    if (zoom >= LABEL_ZOOM) this.markLabel(ctx, cx - r - MARK.labelGap / zoom, cy, us ? 'refused' : 'they refused', tone, zoom);
    ctx.restore();
  }

  markLabel(ctx, right, cy, text, tone, zoom) {
    ctx.font = MARK_FONT.label(zoom);
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 3 / zoom;
    ctx.strokeStyle = 'rgba(6, 12, 16, 0.9)';
    ctx.strokeText(text, right, cy);
    ctx.fillStyle = tone;
    ctx.fillText(text, right, cy);
  }
}
