// Dinamik müzik parçalarını başsız Chrome'da çevrimdışı çalar: WAV + ölçüm.
//
//   node scripts/audio/render-music.mjs [savas|baris|sefer|devlet|deniz|kargasa|olay:<ad>] [--stems[=bölük,bölük]]
//   olay adları: savasIlani, zafer, yenilgi (src/audio/cues.js)
//
// Çıktı scripts/audit/_tmp/audio/ (gitignore): hexwar-<parça>-<sn>sn.wav;
// --stems her bölüğü tek başına ölçer ve stem-<parça>-<bölük>.wav yazar.
// Karışım dengesi kulakla değil RMS ve bant enerjisiyle ayarlanır.
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { launch } from "../../trailer/capture/cdp.mjs";

const OUT = "scripts/audit/_tmp/audio";
const piece = process.argv.slice(2).find((a) => !a.startsWith("--")) ?? "savas";
const cue = piece.startsWith("olay:") ? piece.slice(5) : null;
const port = 6200 + Math.floor(Math.random() * 500);
const server = spawn(process.execPath, ["scripts/dev-server.mjs"], { env: { ...process.env, PORT: String(port) }, stdio: "ignore" });

for (let i = 0; i < 50; i++) {
  try { await fetch(`http://127.0.0.1:${port}/muziklab.html`); break; } catch { await new Promise((r) => setTimeout(r, 100)); }
}

const page = await launch({ width: 1200, height: 900, gpu: false });
try {
  await page.goto(`http://127.0.0.1:${port}/muziklab.html`);
  // Sayfa modülü çökerse kanca hiç tanımlanmaz; sonsuza dek beklemek yerine 60 sn'de düş.
  await page.evaluate("new Promise((r, j) => { const t0 = Date.now(); const w = () => window.__renderPiece ? r() : Date.now() - t0 > 60000 ? j(new Error('sayfa modülü yüklenmedi (__renderPiece yok) — tarayıcı konsoluna bak')) : setTimeout(w, 50); w(); })");
  mkdirSync(OUT, { recursive: true });

  const mix = await page.evaluate(cue ? `window.__renderCue(${JSON.stringify(cue)})` : `window.__renderPiece(${JSON.stringify(piece)})`);
  const secs = Math.round(mix.analysis.rms.length / 2);
  const file = join(OUT, cue ? `hexwar-olay-${cue}.wav` : `hexwar-${piece}-${secs}sn.wav`);
  writeFileSync(file, Buffer.from(mix.wav, "base64"));
  const a = mix.analysis;
  console.log(`karışım  ${file}  son adım ${mix.hitAt.toFixed(2)} sn  tepe ${a.peak}  kırpılan ${a.clipped}  ${a.overall} dBFS`);
  console.log(`  RMS/0.5sn: ${a.rms.join(" ")}`);
  console.log(`  ölçü başları (sn): ${mix.barTimes.map((t) => t.toFixed(2)).join(" ")}`);

  // --stems: bütün bölükler; --stems=piano,vln: yalnız bunlar (uzun parçada her
  // stem bir tam döküm sürer).
  const stemArg = process.argv.find((a) => a.startsWith("--stems"));
  if (stemArg && !cue) {
    const only = stemArg.includes("=") ? stemArg.split("=")[1].split(",") : mix.buses;
    for (const s of only) {
      const r = await page.evaluate(`window.__renderPiece(${JSON.stringify(piece)}, ${JSON.stringify(s)})`);
      writeFileSync(join(OUT, `stem-${piece}-${s}.wav`), Buffer.from(r.wav, "base64"));
      console.log(`  ${s.padEnd(6)} ${String(r.analysis.overall).padStart(6)} dBFS  tepe ${r.analysis.peak}`);
    }
  }
  if (page.logs.length) console.log(page.logs.join("\n"));
} finally {
  // Chrome kapanış yanıtını göndermeden ölürse close() hiç dönmüyor; süre sınırı.
  await Promise.race([page.close(), new Promise((r) => setTimeout(r, 3000))]);
  server.kill();
}
process.exit(0);
