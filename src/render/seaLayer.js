// DENİZ KATMANI: Seas harita kipinin bölge tonları ve adları, bütün siyasi
// kiplerde filo ve deniz muharebesi işaretleri (game/navy.js).
//
// Ton her kare çizilmez. Bölgeler düşük çözünürlüklü bir dokuya basılır, kara
// sınır ağının YUMUŞAK kıyısıyla oyulur (hex kenarlı ton karaya 17 px'e dek
// taşıyordu) ve doku yalnız bölgelerin renk imzası değişince yeniden basılır
// (haftada en çok bir). Kare başına maliyet kopya başına tek drawImage ve
// birkaç işaret.

import { DIRS, HEX_CORNERS } from '../core/hex.js';
import { HEX_SIZE } from '../world/worldgen.js';
import { seaZonesOf } from '../world/seaZones.js';
import { atWar } from '../game/diplomacy.js';
import { isAllied } from '../game/alliances.js';
import { seaLaneView } from '../game/seaLanes.js';
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
    const P = world.wrapWidth || 0;
    const x0 = -(Math.sqrt(3) * HEX_SIZE) / 2;
    const y0 = world.bounds.minY;
    this.geo = { world, zones, paths, borders, anchors, P, x0, y0, h: world.bounds.maxY - y0 };
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
    return this.geometry(world).zones.map((zone) => {
      const here = presence?.get(zone.id);
      if (!here?.size) return null;
      const seen = new Set();
      for (const [nationId] of here) seen.add(relationTo(world, playerId, nationId));
      const friendly = seen.has('ours') || seen.has('ally');
      if (friendly && seen.has('enemy')) return 'contested';
      if (seen.has('enemy')) return 'enemy';
      if (seen.has('ours')) return 'ours';
      if (seen.has('ally')) return 'ally';
      return 'other';
    });
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
      ctx.fillStyle = SEA_COLORS[key];
      for (const dx of shifts) {
        ctx.save();
        ctx.translate(dx, 0);
        ctx.fill(geo.paths[id]);
        ctx.restore();
      }
    });
    ctx.filter = 'none';
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
    if (!this.renderer.markPass) this.drawZoneNames(ctx, world, rect);
  }

  /** Bölge adları (ve paneldeki satırın halkası), derin noktada. */
  drawZoneNames(ctx, world, rect) {
    const geo = this.geometry(world);
    if (!geo.zones.length) return;
    const U = this.renderer.upright;
    const zoom = this.renderer.camera.zoom;
    const size = 12.5 / zoom;
    ctx.save();
    ctx.font = `italic ${size}px Georgia, "Times New Roman", serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 3 / zoom;
    ctx.strokeStyle = 'rgba(6, 12, 16, 0.85)';
    ctx.fillStyle = 'rgba(214, 232, 244, 0.9)';
    geo.zones.forEach((zone, id) => {
      const anchor = geo.anchors[id];
      for (const dx of copiesIn(anchor.x, anchor.y, rect, geo.P)) {
        const at = { x: anchor.x + dx, y: anchor.y };
        if (U && !U.pin(ctx, at.x, at.y)) continue;
        const lit = id === this.highlight;
        ctx.fillStyle = lit ? '#f0d795' : 'rgba(214, 232, 244, 0.9)';
        ctx.strokeText(zone.name, at.x, at.y - 6 / zoom);
        ctx.fillText(zone.name, at.x, at.y - 6 / zoom);
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
    if (!state?.presence?.size && !state?.subs?.size) return;
    const geo = this.geometry(world);
    const zoom = this.renderer.camera.zoom;
    const turn = world.turn ?? 0;
    const order = { ours: 0, ally: 1, enemy: 2, other: 3 };
    const h = 14 / zoom;
    const U = this.renderer.upright;
    const rowsOf = (here, keep) => [...here.entries()]
      .map(([nationId, entry]) => ({ nationId, count: entry.ships.length, rel: relationTo(world, playerId, nationId) }))
      .filter(keep)
      .sort((a, b) => order[a.rel] - order[b.rel] || b.count - a.count || a.nationId - b.nationId)
      .slice(0, 3);
    ctx.save();
    ctx.font = `700 ${10.5 / zoom}px "Segoe UI", Arial, sans-serif`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    for (const [zoneId, here] of state.presence ?? []) {
      const anchor = geo.anchors[zoneId];
      if (!anchor) continue;
      const rows = rowsOf(here, (row) => everyone || row.rel !== 'other');
      if (!rows.length) continue;
      for (const dx of copiesIn(anchor.x, anchor.y, rect, geo.P)) {
        if (U && !U.pin(ctx, anchor.x + dx, anchor.y)) continue;
        this.badges(ctx, world, anchor.x + dx, anchor.y + 4 / zoom, rows, { zoom, sub: false });
      }
    }
    // Denizaltılar: filo satırının altında kesik kenarlı kapsül, "U" + sayı.
    // Seas kipinde herkesinki, öteki kiplerde yalnız bizim ve düşmanınki.
    for (const [zoneId, here] of state.subs ?? []) {
      const anchor = geo.anchors[zoneId];
      if (!anchor) continue;
      const rows = rowsOf(here, (row) => everyone || row.rel === 'ours' || row.rel === 'enemy');
      if (!rows.length) continue;
      for (const dx of copiesIn(anchor.x, anchor.y, rect, geo.P)) {
        if (U && !U.pin(ctx, anchor.x + dx, anchor.y)) continue;
        this.badges(ctx, world, anchor.x + dx, anchor.y + 4 / zoom + h + 3 / zoom, rows, { zoom, sub: true });
      }
    }
    // Son iki haftanın deniz muharebeleri: bölgede kırmızı çapraz kılıç.
    for (const report of state.reports ?? []) {
      if (turn - report.turn > BATTLE_MARK_WEEKS) continue;
      const anchor = geo.anchors[report.zone];
      if (!anchor) continue;
      const mine = playerId >= 0 && report.sides.some((side) => side.nations.includes(playerId));
      if (!everyone && !mine) continue;
      for (const dx of copiesIn(anchor.x, anchor.y, rect, geo.P)) {
        if (U && !U.pin(ctx, anchor.x + dx, anchor.y)) continue;
        this.battleMark(ctx, anchor.x + dx, anchor.y - 22 / zoom, zoom);
      }
    }
    ctx.restore();
  }

  /** Ulus başına bayrak + sayı rozetleri, ortalı tek satır. */
  badges(ctx, world, cx, y, rows, { zoom, sub }) {
    const pad = 3 / zoom;
    const flagW = (sub ? 12 : 15) / zoom;
    const flagH = (sub ? 8 : 10) / zoom;
    const h = (sub ? 12.6 : 14) / zoom;
    const texts = rows.map((row) => (sub ? `U${row.count}` : String(row.count)));
    const widths = texts.map((text) => flagW + pad * 3 + ctx.measureText(text).width);
    const total = widths.reduce((sum, w) => sum + w, 0) + (rows.length - 1) * pad;
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

  battleMark(ctx, cx, cy, zoom) {
    const r = 7 / zoom;
    ctx.fillStyle = 'rgba(30, 6, 4, 0.85)';
    ctx.strokeStyle = '#ff8f6e';
    ctx.lineWidth = 1.4 / zoom;
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
  }
}
