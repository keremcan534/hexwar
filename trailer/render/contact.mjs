// Son videodan temas sayfaları: zaman damgalı kare ızgarası.
//
//   node render/contact.mjs out/imperial-eye-trailer.mp4             # her 1.5 sn + kilit anlar
//   node render/contact.mjs out/x.mp4 --times 34.0,34.03,34.1 --name war
import { spawn } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { join, resolve, basename } from "node:path";
import { FFMPEG } from "./ffmpeg.mjs";

const ROOT = resolve(import.meta.dirname, "..");
const video = resolve(process.argv[2] ?? join(ROOT, "out/imperial-eye-trailer.mp4"));
const arg = (k) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : null; };
const run = (a) => new Promise((ok, no) => { const p = spawn(FFMPEG, ["-hide_banner", "-loglevel", "error", "-y", ...a], { stdio: "inherit" }); p.on("close", (c) => (c ? no(new Error("ffmpeg " + c)) : ok())); });

const KEY = {
  opening: [0.5, 1.6, 3.0, 4.9, 6.0, 7.4, 8.5, 9.6, 10.6, 11.6],
  pressure: [11.93, 12.5, 13.44, 14.3, 14.95, 15.8, 16.8, 17.6, 18.4, 18.9, 19.3, 19.46],
  decision: [20.0, 21.5, 23.0, 23.95, 24.9, 25.97, 26.8, 27.5, 28.0, 29.0, 31.0, 33.0, 33.6, 33.9],
  war: [34.03, 34.06, 34.15, 34.4, 35.0, 35.53, 36.5, 37.6, 38.6, 39.55, 40.5, 41.6, 42.6, 43.4],
  payoff: [43.55, 44.6, 45.6, 46.1, 47.0, 47.52, 47.6, 48.1, 49.6, 50.3, 51.0, 51.9, 52.1, 53.0],
  crescendo: [53.55, 54.1, 55.0, 55.55, 56.1, 57.0, 57.55, 58.1, 59.0, 59.55, 60.1, 61.0, 61.55, 62.1, 62.55, 63.1],
  ending: [63.52, 63.6, 64.1, 65.0, 66.0, 67.0, 68.0, 69.0, 70.0, 70.8, 71.4, 71.9],
};

async function sheet(name, times, cols = 4) {
  const tmp = join(ROOT, "scratch", `contact-${name}`);
  rmSync(tmp, { recursive: true, force: true }); mkdirSync(tmp, { recursive: true });
  const font = "C\\:/Windows/Fonts/bahnschrift.ttf";
  for (const [i, t] of times.entries()) {
    await run(["-ss", String(t), "-i", video, "-frames:v", "1", "-vf",
      `scale=640:-1,drawtext=fontfile='${font}':text='${t.toFixed(2)}s':x=10:y=10:fontsize=22:fontcolor=white:box=1:boxcolor=black@0.6:boxborderw=6`,
      join(tmp, `${String(i).padStart(3, "0")}.png`)]);
  }
  const rows = Math.ceil(times.length / cols);
  const out = join(ROOT, "out", "contact", `${basename(video, ".mp4")}-${name}.jpg`);
  mkdirSync(join(ROOT, "out", "contact"), { recursive: true });
  await run(["-i", join(tmp, "%03d.png"), "-vf", `tile=${cols}x${rows}:padding=4:color=0x111111`, "-frames:v", "1", "-q:v", "3", out]);
  rmSync(tmp, { recursive: true, force: true });
  console.log(out);
}

if (arg("times")) await sheet(arg("name") ?? "custom", arg("times").split(",").map(Number));
else {
  const all = []; for (let t = 0.5; t < 72; t += 1.5) all.push(+t.toFixed(2));
  await sheet("overview", all, 6);
  for (const [k, v] of Object.entries(KEY)) await sheet(k, v);
}
