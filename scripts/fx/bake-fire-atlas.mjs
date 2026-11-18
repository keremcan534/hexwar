// Siyah zeminli yangın videosundan harita alevinin kare dokusunu üretir.
//
//   node scripts/fx/bake-fire-atlas.mjs "<video.mp4>"
//
// Çıktı: assets/fx/fire-atlas.webp (8×8 kare, 256 px). Doku yüklenemezse oyun GPU
// alevine düşer.
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const video = process.argv[2];
if (!video) {
  console.error('Kullanım: node scripts/fx/bake-fire-atlas.mjs "<video.mp4>"');
  process.exit(1);
}
const OUT = resolve(import.meta.dirname, '../../assets/fx/fire-atlas.webp');
const FRAMES = 64;
const GRID = 8;
const CELL = 256;
/** Baştaki tutuşma ve sondaki sönme atılır: döngüde yalnız tam yanan alev kalır. */
const SKIP_HEAD = 0.2;
const SKIP_TAIL = 0.17;
const PROBE = 270;

const probe = (args) => execFileSync('ffprobe', ['-v', 'error', ...args, video], { encoding: 'utf8' }).trim();
const total = Number(probe(['-select_streams', 'v:0', '-count_packets', '-show_entries', 'stream=nb_read_packets', '-of', 'csv=p=0']));
const size = Number(probe(['-select_streams', 'v:0', '-show_entries', 'stream=width', '-of', 'csv=p=0']));
const first = Math.round(total * SKIP_HEAD);
const last = Math.round(total * (1 - SKIP_TAIL));
const step = (last - first) / FRAMES;
const pick = `select='gte(n,${first})*lt(n,${last})*lt(mod(n-${first},${step.toFixed(4)}),1)'`;

// Alevin bütün karelerdeki kapsamı: kare, boş siyah alan taşımasın.
const raw = execFileSync('ffmpeg', ['-v', 'error', '-i', video, '-map', '0:v:0', '-vf',
  `${pick},scale=${PROBE}:${PROBE},format=gray`, '-fps_mode', 'passthrough', '-f', 'rawvideo', '-'], { maxBuffer: 1 << 28 });
let minX = PROBE; let maxX = 0; let minY = PROBE; let maxY = 0;
for (let i = 0; i < raw.length; i++) {
  if (raw[i] < 40) continue;
  const x = i % (PROBE * PROBE) % PROBE;
  const y = Math.floor((i % (PROBE * PROBE)) / PROBE);
  minX = Math.min(minX, x); maxX = Math.max(maxX, x);
  minY = Math.min(minY, y); maxY = Math.max(maxY, y);
}
const scale = size / PROBE;
const side = Math.min(size, Math.ceil(Math.max(maxX - minX, maxY - minY) * scale * 1.16));
const clampCrop = (center) => Math.max(0, Math.min(size - side, Math.round(center * scale - side / 2)));
const cropX = clampCrop((minX + maxX) / 2);
const cropY = clampCrop((minY + maxY) / 2);

mkdirSync(dirname(OUT), { recursive: true });
execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', video, '-map', '0:v:0', '-vf',
  `${pick},crop=${side}:${side}:${cropX}:${cropY},scale=${CELL}:${CELL}:flags=lanczos,tile=${GRID}x${GRID}`,
  '-fps_mode', 'passthrough', '-frames:v', '1', '-c:v', 'libwebp', '-quality', '88', '-compression_level', '6', OUT]);
console.log(`${OUT}\nkare ${first}-${last} / ${total}, kırpma ${side}px @ ${cropX},${cropY}`);
