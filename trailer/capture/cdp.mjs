// Başsız Chrome'u CDP üzerinden sürer. Bağımlılık yok: Node'un yerleşik
// WebSocket'i yeter. Ayrı profil dizini kullanılır; oyuncunun kayıtlı
// oyunu aynı kökende durur ve başsız profil onu görmez.
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CHROME = process.env.CHROME ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";

export async function launch({ width = 1920, height = 1080, port = 9333 + Math.floor(Math.random() * 500), gpu = true } = {}) {
  const profile = mkdtempSync(join(tmpdir(), "ie-trailer-"));
  const args = [
    "--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
    `--window-size=${width},${height}`, "--hide-scrollbars", "--mute-audio",
    "--no-first-run", "--no-default-browser-check", "--force-device-scale-factor=1",
    "--disable-background-timer-throttling", "--disable-renderer-backgrounding",
    "--disable-backgrounding-occluded-windows", "--autoplay-policy=no-user-gesture-required",
    ...(gpu ? ["--enable-gpu", "--use-angle=d3d11", "--ignore-gpu-blocklist", "--enable-unsafe-webgpu"]
            : ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"]),
    "about:blank",
  ];
  const proc = spawn(CHROME, args, { stdio: "ignore" });
  let ver;
  for (let i = 0; i < 100; i++) {
    try { ver = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); if (ver.length) break; } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  const page = ver.find((t) => t.type === "page");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let id = 0; const pending = new Map(); const listeners = new Map();
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && pending.has(msg.id)) {
      const { res, rej } = pending.get(msg.id); pending.delete(msg.id);
      msg.error ? rej(new Error(JSON.stringify(msg.error))) : res(msg.result);
    } else if (msg.method) (listeners.get(msg.method) ?? []).forEach((f) => f(msg.params));
  };
  const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
  const on = (ev, f) => { if (!listeners.has(ev)) listeners.set(ev, []); listeners.get(ev).push(f); };
  await send("Page.enable"); await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
  const logs = [];
  on("Runtime.consoleAPICalled", (p) => logs.push(p.type + ": " + p.args.map((a) => a.value ?? a.description ?? "").join(" ")));
  on("Runtime.exceptionThrown", (p) => logs.push("EXC: " + (p.exceptionDetails.exception?.description ?? p.exceptionDetails.text)));

  async function evaluate(expr, { awaitPromise = true, timeout = 600000 } = {}) {
    const r = await send("Runtime.evaluate", { expression: expr, awaitPromise, returnByValue: true, timeout });
    if (r.exceptionDetails) throw new Error("page: " + (r.exceptionDetails.exception?.description ?? r.exceptionDetails.text));
    return r.result.value;
  }
  async function goto(url, { preload } = {}) {
    if (preload) await send("Page.addScriptToEvaluateOnNewDocument", { source: preload });
    const loaded = new Promise((r) => on("Page.loadEventFired", r));
    await send("Page.navigate", { url });
    await loaded;
  }
  async function shot({ format = "png", quality, clip } = {}) {
    const r = await send("Page.captureScreenshot", { format, quality, clip, captureBeyondViewport: false, optimizeForSpeed: format !== "png" });
    return Buffer.from(r.data, "base64");
  }
  async function close() { try { await send("Browser.close"); } catch {} proc.kill(); }
  return { send, on, evaluate, goto, shot, close, logs };
}
