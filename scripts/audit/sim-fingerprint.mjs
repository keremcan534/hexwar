// SİMÜLASYON PARMAK İZİ — "davranış değişmedi" iddiasının kanıtı.
//
// redesign P1'in kabulü: dikiş paketi (yalnız uyuyan dallar) eski alanların
// parmak izini bayt bayt korumalı (STAT1 160×96 260 hafta, BORDER1 78×62
// 520 hafta). P0 o izi dondurulmuş anlık görüntüde basar ve tabana yazar;
// sonraki paket aynı komutu kendi ağacında koşar ve kıyaslar.
//
//   node scripts/audit/sim-fingerprint.mjs TOHUM HAFTA [sütun satır]
//
// Çıktı: JSON (çekirdek = worldFingerprint, eski alanlar; genişletilmiş =
// extendedFingerprint, yeniden tasarımın alanları) ve tam metin
// scripts/audit/_tmp/fp-TOHUM-HAFTA-SÜTUNxSATIR.txt (fark almak için).

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { headless, run } from './harness.mjs';
import { worldFingerprint, extendedFingerprint, fingerprintHash } from './fingerprint.mjs';

const SEED = process.argv[2] ?? 'STAT1';
const WEEKS = Number(process.argv[3] ?? 260);
const COLS = Number(process.argv[4] ?? 160);
const ROWS = Number(process.argv[5] ?? 96);

const t0 = Date.now();
const game = headless(SEED, { cols: COLS, rows: ROWS });
run(game, WEEKS);
const core = worldFingerprint(game);
const extended = extendedFingerprint(game);
const dir = join(dirname(fileURLToPath(import.meta.url)), '_tmp');
mkdirSync(dir, { recursive: true });
const file = join(dir, `fp-${SEED}-${WEEKS}-${COLS}x${ROWS}.txt`);
writeFileSync(file, `${core}\n${extended}\n`);
console.log(JSON.stringify({
  seed: SEED, weeks: WEEKS, cols: COLS, rows: ROWS,
  core: fingerprintHash(core), extended: fingerprintHash(extended),
  coreBytes: core.length, extendedBytes: extended.length,
  secs: Math.round((Date.now() - t0) / 1000), file,
}));
