// Ülke şekli denetimi: dünya kurulurken doğan sınırlar "güzel" mi?
//
//   node scripts/audit/nation-shape-audit.mjs [TOHUM,TOHUM…] [--earth] [--gen=1|2]
//
// "Güzel" burada beş ölçüdür (ülke başına, sonra dünya ortalaması):
//   PP      Polsby-Popper (4πA/P²) anakarada; tek hex 0.91, kıyı da çevreye sayılır
//   hull    anakara alanı / dışbükey zarf alanı (hex köşeleriyle)
//   ince    açılma (1 hex aşındır + geri büyüt) sonrası kaybolan kare payı: 1-2 hex
//           genişliğinde siyasi kol/koridor. Su ve sahipsiz kara aşındırmaz: dar
//           yarımada ince sayılmaz, yalnız komşunun kıstırdığı uzantı sayılır.
//   kol     ≥3 karelik bitişik ince parça sayısı
//   kopuk   anakaradan kopuk ama başka ülkenin karasına değen parça (ada değil)
//   cep     tek bir yabancı ülkenin tamamen sardığı parça (kıyısız)
//   doğal   ülkeler arası kara sınır kenarının nehir / sırt / dağlıktan geçen payı
//           (yanında dünyanın bütün kara kenarlarındaki taban oran: rastlantı beklentisi)
//   kıyı    çevrenin denize bakan payı
//   merkez  başkentin anakara ağırlık merkezine uzaklığı / eşdeğer daire yarıçapı
// Boy dağılımı da yazılır: şekil kuralı ülke sayısını ve boyları oynatmamalı.

import { STANDARD_COLS, STANDARD_ROWS, generateWorld } from '../../src/world/worldgen.js';
import { generateNations } from '../../src/world/nations.js';
import { ridgeTable } from '../../src/world/provinces-gen.js';
import { DIRS } from '../../src/core/hex.js';

const args = process.argv.slice(2);
const EARTH = args.includes('--earth');
const GEN = (args.find((a) => a.startsWith('--gen=')) ?? '').slice(6);
const seedArg = args.find((a) => !a.startsWith('--'));
const SEEDS = seedArg ? seedArg.split(',') : ['SHAPE1', 'SHAPE2', 'SHAPE3', 'SHAPE4', 'SHAPE5'];
const SQRT3 = Math.sqrt(3);
const HEX_AREA = 1.5 * SQRT3;

const isLand = (t) => t && !t.terrain.water;
const px = (t) => SQRT3 * (t.q + t.r / 2);
const py = (t) => 1.5 * t.r;

function hull(points) {
  points.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [];
  for (const p of points) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper = [];
  for (let i = points.length - 1; i >= 0; i--) {
    const p = points[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  const h = lower.slice(0, -1).concat(upper.slice(0, -1));
  let area = 0;
  for (let i = 0; i < h.length; i++) {
    const [x1, y1] = h[i];
    const [x2, y2] = h[(i + 1) % h.length];
    area += x1 * y2 - x2 * y1;
  }
  return Math.abs(area) / 2;
}

const quant = (arr, q) => {
  const s = arr.slice().sort((a, b) => a - b);
  return s.length ? s[Math.min(s.length - 1, Math.floor(q * s.length))] : 0;
};
const mean = (arr) => (arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0);

function measure(world) {
  const W = SQRT3 * world.cols;
  const tiles = world.tiles;
  const ridge = ridgeTable(world);
  const owner = (t) => (t && isLand(t) ? t.owner : -2);
  const nations = world.nations.filter((n) => n.archetype !== 'rebel' && n.tiles > 0);
  const byNation = new Map(nations.map((n) => [n.id, []]));
  for (const t of tiles) if (isLand(t) && byNation.has(t.owner)) byNation.get(t.owner).push(t);

  // Sınır kenarları: her kara-kara kenarı bir kez.
  let edgesAll = 0; let naturalAll = 0; let border = 0; let naturalBorder = 0;
  const natural = (t, d, n) => (t.riverMask & (1 << d)) || ridge[(t.row * world.cols + t.col) * 6 + d] > 0
    || t.terrain.highland || n.terrain.highland;
  for (let i = 0; i < tiles.length; i++) {
    const t = tiles[i];
    if (!isLand(t)) continue;
    for (let d = 0; d < 6; d++) {
      const n = world.get(t.q + DIRS[d][0], t.r + DIRS[d][1]);
      if (!isLand(n)) continue;
      const j = n.row * world.cols + n.col;
      if (j <= i) continue;
      const nat = natural(t, d, n) ? 1 : 0;
      edgesAll++; naturalAll += nat;
      if (t.owner >= 0 && n.owner >= 0 && t.owner !== n.owner) { border++; naturalBorder += nat; }
    }
  }

  const rows = [];
  for (const nation of nations) {
    const own = byNation.get(nation.id);
    const set = new Set(own);
    // Parçalar
    const seen = new Set();
    const pieces = [];
    for (const start of own) {
      if (seen.has(start)) continue;
      const part = [start];
      seen.add(start);
      for (let h = 0; h < part.length; h++) {
        for (const n of world.neighbors(part[h])) {
          if (set.has(n) && !seen.has(n)) { seen.add(n); part.push(n); }
        }
      }
      pieces.push(part);
    }
    pieces.sort((a, b) => b.length - a.length);
    const main = pieces[0];
    let exclaves = 0; let pockets = 0;
    for (const [k, part] of pieces.entries()) {
      const foreign = new Set();
      let open = false;
      for (const t of part) {
        for (const n of world.neighbors(t)) {
          if (set.has(n)) continue;
          const o = owner(n);
          if (o < 0) open = true; else foreign.add(o);
        }
      }
      if (k > 0 && foreign.size) exclaves++;
      if (!open && foreign.size === 1) pockets++;
    }
    // Anakara geometrisi: sarmalı BFS ile aç.
    const ux = new Map([[main[0], px(main[0])]]);
    const queue = [main[0]];
    const mainSet = new Set(main);
    for (let h = 0; h < queue.length; h++) {
      const t = queue[h];
      for (const n of world.neighbors(t)) {
        if (!mainSet.has(n) || ux.has(n)) continue;
        let x = px(n);
        x += W * Math.round((ux.get(t) - x) / W);
        ux.set(n, x);
        queue.push(n);
      }
    }
    const corners = [];
    let perim = 0; let coast = 0; let cx = 0; let cy = 0;
    for (const t of main) {
      const x = ux.get(t); const y = py(t);
      cx += x; cy += y;
      for (let k = 0; k < 6; k++) {
        const a = Math.PI / 6 + (k * Math.PI) / 3;
        corners.push([x + Math.cos(a), y + Math.sin(a)]);
      }
      for (const n of world.neighbors(t)) {
        if (mainSet.has(n)) continue;
        perim++;
        if (!isLand(n)) coast++;
      }
      perim += 6 - world.neighbors(t).length; // kutup kenarı
    }
    cx /= main.length; cy /= main.length;
    const area = main.length * HEX_AREA;
    const pp = perim ? (4 * Math.PI * area) / (perim * perim) : 1;
    const hullRatio = Math.min(1, area / Math.max(area, hull(corners)));
    // Başkent merkezliği
    let centr = null;
    const cap = nation.capital && world.get(nation.capital.q, nation.capital.r);
    if (cap && mainSet.has(cap)) {
      const d = Math.hypot(ux.get(cap) - cx, py(cap) - cy);
      centr = d / Math.sqrt(area / Math.PI);
    }
    // İnce uzantı: açılma
    const interior = new Set(own.filter((t) => world.neighbors(t).every((n) => owner(n) < 0 || n.owner === nation.id)));
    const opened = new Set(interior);
    for (const t of interior) for (const n of world.neighbors(t)) if (set.has(n)) opened.add(n);
    const thin = own.filter((t) => !opened.has(t));
    const thinSet = new Set(thin);
    let arms = 0;
    const tseen = new Set();
    for (const s of thin) {
      if (tseen.has(s)) continue;
      const part = [s]; tseen.add(s);
      for (let h = 0; h < part.length; h++) {
        for (const n of world.neighbors(part[h])) if (thinSet.has(n) && !tseen.has(n)) { tseen.add(n); part.push(n); }
      }
      if (part.length >= 3) arms++;
    }
    rows.push({
      id: nation.id, tiles: own.length, provinces: nation.provinces, pp, hullRatio,
      thin: thin.length, arms, exclaves, pockets, centr, coast: perim ? coast / perim : 0,
    });
  }
  const totalTiles = rows.reduce((s, r) => s + r.tiles, 0);
  const big = rows.filter((r) => r.tiles >= 12);
  return {
    nations: rows.length,
    pp: mean(big.map((r) => r.pp)),
    hull: mean(big.map((r) => r.hullRatio)),
    thin: rows.reduce((s, r) => s + r.thin, 0) / Math.max(1, totalTiles),
    arms: rows.reduce((s, r) => s + r.arms, 0),
    exclaves: rows.reduce((s, r) => s + r.exclaves, 0),
    pockets: rows.reduce((s, r) => s + r.pockets, 0),
    natural: border ? naturalBorder / border : 0,
    naturalBase: edgesAll ? naturalAll / edgesAll : 0,
    coast: mean(big.map((r) => r.coast)),
    centr: mean(big.filter((r) => r.centr != null).map((r) => r.centr)),
    provP10: quant(rows.map((r) => r.provinces), 0.1),
    provP50: quant(rows.map((r) => r.provinces), 0.5),
    provP90: quant(rows.map((r) => r.provinces), 0.9),
    provMax: Math.max(...rows.map((r) => r.provinces)),
  };
}

const fmt = (m) => [
  `ulus ${m.nations}`.padEnd(9),
  `PP ${m.pp.toFixed(3)}`, `hull ${m.hull.toFixed(3)}`,
  `ince %${(m.thin * 100).toFixed(1)}`, `kol ${m.arms}`.padEnd(7),
  `kopuk ${m.exclaves}`.padEnd(8), `cep ${m.pockets}`.padEnd(6),
  `dogal %${(m.natural * 100).toFixed(1)} (taban %${(m.naturalBase * 100).toFixed(1)})`,
  `kiyi %${(m.coast * 100).toFixed(0)}`, `merkez ${m.centr.toFixed(2)}`,
  `prov p10/50/90/max ${m.provP10}/${m.provP50}/${m.provP90}/${m.provMax}`,
].join(' · ');

const all = [];
for (const seed of SEEDS) {
  const options = EARTH ? { map: 'earth' } : { cols: STANDARD_COLS, rows: STANDARD_ROWS };
  if (GEN) options.nationGen = Number(GEN);
  const world = generateWorld(seed, options);
  const t0 = performance.now();
  generateNations(world, { seed: `${seed}-nations` });
  const ms = performance.now() - t0;
  const m = measure(world);
  all.push(m);
  console.log(`${seed.padEnd(8)} ${fmt(m)} · ${ms.toFixed(0)} ms`);
}
if (all.length > 1) {
  const avg = {};
  for (const key of Object.keys(all[0])) avg[key] = mean(all.map((m) => m[key]));
  avg.nations = Math.round(avg.nations * 10) / 10;
  for (const k of ['arms', 'exclaves', 'pockets', 'provP10', 'provP50', 'provP90', 'provMax']) avg[k] = avg[k].toFixed(1);
  console.log(`ORTALAMA ${fmt(avg)}`);
}
