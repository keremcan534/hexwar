// Oyun oturumu: başsız Chrome'da oyunu açar, senaryo modülünü yükler,
// sanal saat kurar. Sanal saat şart: su ve three.js deniz animasyonu duvar
// saatine bağlı; kare kare yakalarken her karede tam 1/60 sn ilerlemeli.
import { launch } from "./cdp.mjs";

export const GAME_URL = process.env.GAME_URL ?? "http://localhost:54892";

// Sayfa yüklenmeden önce çalışır: performance.now / Date.now / rAF sanal
// saate bağlanır. `__clock.step(ms)` saati ilerletir ve bekleyen rAF
// geri çağrılarını o zamanla çalıştırır.
const VIRTUAL_CLOCK = `(() => {
  const realNow = performance.now.bind(performance);
  const realDate = Date.now;
  let virt = null, base = 0, dateBase = 0;
  let queue = [], nextId = 1;
  const realRaf = window.requestAnimationFrame.bind(window);
  const realCancel = window.cancelAnimationFrame.bind(window);
  window.__clock = {
    get on() { return virt !== null; },
    start() { base = realNow(); dateBase = realDate(); virt = base; },
    now() { return virt; },
    step(ms) {
      virt += ms;
      const q = queue; queue = [];
      for (const [, cb] of q) { try { cb(virt); } catch (e) { console.error(e); } }
    },
    pending() { return queue.length; },
  };
  performance.now = () => (virt !== null ? virt : realNow());
  Date.now = () => (virt !== null ? dateBase + (virt - base) : realDate());
  window.requestAnimationFrame = (cb) => {
    if (virt === null) return realRaf(cb);
    const id = nextId++; queue.push([id, cb]); return -id;
  };
  window.cancelAnimationFrame = (id) => {
    if (id < 0) queue = queue.filter((x) => x[0] !== -id); else realCancel(id);
  };
})();`;

export async function openGame({ seed = "STEAM", sea = true, width = 1920, height = 1080 } = {}) {
  const b = await launch({ width, height });
  await b.goto(`${GAME_URL}/?seed=${encodeURIComponent(seed)}${sea ? "" : "&deniz=0"}`, { preload: VIRTUAL_CLOCK });
  // three.js deniz modülü dinamik yüklenir; hazır olana dek bekle.
  for (let i = 0; i < 100; i++) {
    const ok = await b.evaluate(`!!window.game && (!${sea} || !!window.deniz)`);
    if (ok) break;
    await new Promise((r) => setTimeout(r, 200));
  }
  await b.evaluate(`(async () => { window.S = await import('/trailer/capture/scenario.js'); window.CAP = await import('/trailer/capture/page.js'); S.quiet(); })()`);
  return b;
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
