// Gitar tonu A/B dökümü: savaşın aynı iki ölçüsü, her amfi ön ayarıyla sırayla.
//
//   node scripts/audio/guitar-ab.mjs
//
// Çıktı scripts/audit/_tmp/audio/hexwar-gitar-ab.wav + bölüm başına RMS. Ön ayarlar
// karşılaştırılırken ses düzeyi ±1 dB içinde olmalı: kulak, yüksek olanı "daha
// iyi" sanır (bkz. src/audio/guitar.js AMP_PRESETS çıkış kazançları).
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { launch } from "../../trailer/capture/cdp.mjs";

const OUT = "scripts/audit/_tmp/audio";
const port = 6300 + Math.floor(Math.random() * 400);
const server = spawn(process.execPath, ["scripts/dev-server.mjs"], { env: { ...process.env, PORT: String(port) }, stdio: "ignore" });
for (let i = 0; i < 50; i++) {
  try { await fetch(`http://127.0.0.1:${port}/muziklab.html`); break; } catch { await new Promise((r) => setTimeout(r, 100)); }
}
const page = await launch({ width: 1200, height: 900, gpu: false });
try {
  await page.goto(`http://127.0.0.1:${port}/muziklab.html`);
  // Sayfa modülü çökerse kanca hiç tanımlanmaz; sonsuza dek beklemek yerine 60 sn'de düş.
  await page.evaluate("new Promise((r, j) => { const t0 = Date.now(); const w = () => window.__renderGuitarAB ? r() : Date.now() - t0 > 60000 ? j(new Error('sayfa modülü yüklenmedi (__renderGuitarAB yok) — tarayıcı konsoluna bak')) : setTimeout(w, 50); w(); })");
  mkdirSync(OUT, { recursive: true });
  const r = await page.evaluate("window.__renderGuitarAB()");
  const file = join(OUT, "hexwar-gitar-ab.wav");
  writeFileSync(file, Buffer.from(r.wav, "base64"));
  console.log(`${file}  tepe ${r.analysis.peak}  kırpılan ${r.analysis.clipped}`);
  for (const m of r.marks) console.log(`  ${m.name.padEnd(6)} ${m.start.toFixed(1)}-${m.end.toFixed(1)} sn  RMS ${m.rms} dB`);
  if (page.logs.length) console.log(page.logs.join("\n"));
} finally {
  await Promise.race([page.close(), new Promise((r) => setTimeout(r, 3000))]);
  server.kill();
}
process.exit(0);
