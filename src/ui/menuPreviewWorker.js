// ANA MENÜ ÖNİZLEME İŞÇİSİ — kurulum ekranındaki canlı dünya haritası.
//
// Dünya üretimi 160×96'da 1-2 saniye sürer; ana iş parçacığında koşsa menünün
// canlı sahnesi her ayar değişiminde donardı. `world` katmanı DOM'a dokunmaz
// (CLAUDE.md katman kuralı), o yüzden aynı üretici burada, modül işçisinde
// koşar. Önizleme oyunun kuracağı dünyanın AYNISIDIR: aynı tohum ve aynı
// seçeneklerle generateWorld (uluslar sonra ana iş parçacığında dağıtılır).
//
// Çıktı kare başına bir piksel: arazinin kendi rengi (world/terrain.js),
// karada kuzeybatıdan gelen ışıkla kabartma, denizde derinlik. Ana iş
// parçacığı bunu yumuşatarak büyütür; kağıt üstüne basılmış atlas gibi okunur.

import { generateWorld } from '../world/worldgen.js';
import { SEA_LEVEL } from '../world/terrain.js';

const rgb = (hex) => [
  parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16),
];
const colorCache = new Map();
const colorOf = (terrain) => {
  let c = colorCache.get(terrain);
  if (!c) colorCache.set(terrain, (c = rgb(terrain?.color ?? '#808080')));
  return c;
};

self.onmessage = (event) => {
  const { id, seed, options } = event.data;
  const t0 = performance.now();
  let world;
  try {
    world = generateWorld(seed, options);
  } catch (err) {
    self.postMessage({ id, error: String(err?.message ?? err) });
    return;
  }
  const { cols, rows } = world;
  const elev = new Float32Array(cols * rows);
  for (const tile of world.tiles) elev[tile.row * cols + tile.col] = tile.elevation ?? 0;
  const at = (c, r) => elev[Math.min(rows - 1, Math.max(0, r)) * cols + (((c % cols) + cols) % cols)];

  const px = new Uint8ClampedArray(cols * rows * 4);
  let land = 0;
  for (const tile of world.tiles) {
    const { col, row } = tile;
    const i = (row * cols + col) * 4;
    let [r, g, b] = colorOf(tile.terrain);
    if (tile.terrain?.water) {
      // Kıyıdan uzaklaştıkça koyulaşan deniz: derinlik yükseklikten okunur.
      const depth = Math.min(1, Math.max(0, (SEA_LEVEL - (tile.elevation ?? 0)) / 0.24));
      const k = 1.08 - depth * 0.42;
      r *= k; g *= k; b *= k;
    } else {
      land++;
      // Kuzeybatı ışığı: yamaç ışığa bakıyorsa aydınlanır, değilse gölgede.
      const slope = (at(col - 1, row - 1) - at(col + 1, row + 1)) * 4.2;
      const k = 1 + Math.max(-0.35, Math.min(0.35, slope));
      r *= k; g *= k; b *= k;
      if (tile.river) { r = r * 0.55 + 40; g = g * 0.6 + 70; b = b * 0.6 + 90; }
    }
    px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = 255;
  }
  self.postMessage({
    id, cols, rows, pixels: px,
    land: land / Math.max(1, world.tiles.length),
    ms: performance.now() - t0,
  }, [px.buffer]);
};
