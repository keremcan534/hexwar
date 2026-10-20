// Fragmanı kare kare çizer ve ffmpeg'e borular.
//
//   node render/render.mjs                 # tam fragman -> out/imperial-eye-trailer.mp4
//   node render/render.mjs --from 34 --to 40 --out out/test.mp4   # aralık
//   node render/render.mjs --stills 0,12.5,34.1 # yalnız kareler (png)
//   node render/render.mjs --workers 4     # paralel parçalar, sonra birleştirme
//
// Kompozitör (render/compositor.html) tarayıcıda çalışır: yazı tipi, bulanıklık,
// karışım modları Canvas2D'de hazır. Zaman gerçek değil kare numarasıdır;
// aynı kare her zaman aynı görüntüyü verir.
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { readFile, mkdir, writeFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve, extname, join } from "node:path";
import { launch } from "../capture/cdp.mjs";
import { FFMPEG } from "./ffmpeg.mjs";

const ROOT = resolve(import.meta.dirname, "..");
const args = Object.fromEntries(process.argv.slice(2).reduce((a, x, i, all) => {
  if (x.startsWith("--")) a.push([x.slice(2), all[i + 1] && !all[i + 1].startsWith("--") ? all[i + 1] : true]);
  return a;
}, []));
const FPS = 60;

const types = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json",
  ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".css": "text/css", ".wav": "audio/wav" };
export function serve(root = resolve(ROOT, "..")) {
  return new Promise((ok) => {
    const srv = createServer(async (q, r) => {
      const p = join(root, decodeURIComponent(new URL(q.url, "http://x").pathname));
      try { const b = await readFile(p); r.writeHead(200, { "content-type": types[extname(p)] ?? "application/octet-stream", "cache-control": "max-age=3600" }); r.end(b); }
      catch { r.writeHead(404); r.end(); }
    });
    srv.listen(0, "127.0.0.1", () => ok({ srv, url: `http://127.0.0.1:${srv.address().port}` }));
  });
}

async function openCompositor(url) {
  const b = await launch({ width: 1920, height: 1080 });
  await b.goto(`${url}/trailer/render/compositor.html`);
  const info = await b.evaluate("window.compositorReady");
  return { b, info };
}

async function renderRange(url, f0, f1, outFile, label = "") {
  const { b, info } = await openCompositor(url);
  const ff = spawn(FFMPEG, ["-hide_banner", "-loglevel", "error", "-y", "-f", "image2pipe", "-framerate", String(FPS),
    "-c:v", "png", "-i", "-", "-c:v", "libx264", "-preset", "slow", "-crf", "12", "-tune", "film",
    "-pix_fmt", "yuv420p", "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709",
    "-movflags", "+faststart", outFile], { stdio: ["pipe", "inherit", "inherit"] });
  const t0 = Date.now();
  for (let f = f0; f < f1; f++) {
    await b.evaluate(`renderFrame(${f})`);
    const png = await b.shot({ format: "png" });
    if (!ff.stdin.write(png)) await new Promise((r) => ff.stdin.once("drain", r));
    if ((f - f0) % 60 === 0) {
      const el = (Date.now() - t0) / 1000, done = f - f0 + 1;
      process.stdout.write(`${label} kare ${f}/${f1} (${(done / el).toFixed(1)} k/sn)\n`);
    }
  }
  ff.stdin.end();
  await new Promise((r) => ff.on("close", r));
  const errs = b.logs.filter((l) => /EXC|error/i.test(l));
  if (errs.length) console.log(label, "konsol:", errs.slice(0, 5).join("\n"));
  await b.close();
  return info;
}

async function main() {
  const { srv, url } = await serve();
  await mkdir(join(ROOT, "out"), { recursive: true });
  try {
    if (args.stills) {
      const { b } = await openCompositor(url);
      const dir = join(ROOT, args.dir ?? "out/stills");
      await mkdir(dir, { recursive: true });
      for (const s of String(args.stills).split(",")) {
        const f = Math.round(Number(s) * FPS);
        await b.evaluate(`renderFrame(${f})`);
        await writeFile(join(dir, `f${String(f).padStart(5, "0")}.png`), await b.shot());
      }
      console.log(b.logs.filter((l) => /EXC|error/i.test(l)).slice(0, 8).join("\n"));
      await b.close();
      return;
    }
    const probe = await openCompositor(url);
    const total = Math.round(probe.info.duration * FPS);
    await probe.b.close();
    const f0 = Math.round(Number(args.from ?? 0) * FPS);
    const f1 = Math.min(total, Math.round(Number(args.to ?? probe.info.duration) * FPS));
    const out = resolve(ROOT, args.out ?? "out/imperial-eye-trailer.mp4");
    const silent = out.replace(/\.mp4$/, ".video.mp4");
    const W = Number(args.workers ?? 1);
    if (W <= 1) await renderRange(url, f0, f1, silent);
    else {
      const parts = [];
      const step = Math.ceil((f1 - f0) / W);
      await Promise.all(Array.from({ length: W }, (_, i) => {
        const a = f0 + i * step, z = Math.min(f1, a + step);
        const p = out.replace(/\.mp4$/, `.part${i}.mp4`); parts.push(p);
        return renderRange(url, a, z, p, `[${i}]`);
      }));
      const list = out.replace(/\.mp4$/, ".parts.txt");
      await writeFile(list, parts.map((p) => `file '${p.replace(/\\/g, "/")}'`).join("\n"));
      await run(["-f", "concat", "-safe", "0", "-i", list, "-c", "copy", silent]);
      for (const p of [...parts, list]) await rm(p);
    }
    // ses: mix.py çıktısı aralığa kırpılır
    const mixWav = join(ROOT, "audio/out/mix.wav");
    if (existsSync(mixWav)) {
      await run(["-i", silent, "-ss", String(f0 / FPS), "-t", String((f1 - f0) / FPS), "-i", mixWav,
        "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-c:a", "aac", "-b:a", "320k", "-shortest", "-movflags", "+faststart", out]);
      await rm(silent);
    }
    console.log("bitti:", out);
  } finally { srv.close(); }
}

export function run(a) {
  return new Promise((ok, no) => {
    const p = spawn(FFMPEG, ["-hide_banner", "-loglevel", "error", "-y", ...a], { stdio: "inherit" });
    p.on("close", (c) => (c ? no(new Error("ffmpeg " + c)) : ok()));
  });
}

if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, "/")}` || process.argv[1].endsWith("render.mjs")) main();
