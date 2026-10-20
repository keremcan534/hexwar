// ffmpeg yolu: önce FFMPEG ortam değişkeni, sonra PATH, sonra imageio-ffmpeg'in
// paketlediği ikili (pip install imageio-ffmpeg).
import { execFileSync } from "node:child_process";

function find() {
  if (process.env.FFMPEG) return process.env.FFMPEG;
  try { execFileSync("ffmpeg", ["-version"], { stdio: "ignore" }); return "ffmpeg"; } catch {}
  try {
    return execFileSync("python", ["-c", "import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())"]).toString().trim();
  } catch {}
  throw new Error("ffmpeg bulunamadı: FFMPEG ortam değişkenini ayarla ya da `pip install imageio-ffmpeg`");
}
export const FFMPEG = find();
