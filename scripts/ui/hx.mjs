// HexWar başsız CDP koşucusu (arayüzü gerçek fare/klavye girdisiyle sınamak için).
//
// Kullanım:
//   node scripts/ui/hx.mjs --plan plan.mjs [--port 9301] [--w 1920] [--h 1080] [--seed AUDIT1]
//               [--server http://localhost:5173] [--gpu] [--out <dir>] [--no-boot] [--query a=b]
// plan.mjs: export default async function (hx) { ... }  — hx API aşağıda.
// Koşu sonunda plan'ın döndürdüğü değer JSON olarak stdout'a basılır.
//
// Her koşu kendi profil dizinini ve kendi debug portunu kullanır: paralel
// koşular aynı portu paylaşırsa adımlar tek tarayıcıda karışır.
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, arr) => {
  if (a.startsWith('--')) acc.push([a.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]);
  return acc;
}, []));
const PORT = Number(args.port ?? 9301);
const W = Number(args.w ?? 1920);
const H = Number(args.h ?? 1080);
const SEED = args.seed ?? 'AUDIT1';
const SERVER = args.server ?? 'http://localhost:5173';
const OUT = resolve(args.out ?? join(import.meta.dirname, '../audit/_tmp/ui'));
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const QUERY = args.query ? `&${args.query}` : '';
mkdirSync(OUT, { recursive: true });

// Profil depo dışında: oyuncunun kaydı aynı kökende durur, başsız profil onu görmez.
const profile = join(tmpdir(), 'hexwar-hx', `p${PORT}`);
rmSync(profile, { recursive: true, force: true });
mkdirSync(profile, { recursive: true });

const flags = [
  '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
  `--window-size=${W},${H}`, '--no-first-run', '--no-default-browser-check',
  '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
  '--disable-backgrounding-occluded-windows', '--autoplay-policy=no-user-gesture-required',
  '--mute-audio',
];
if (args.gpu) flags.push('--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist');
else flags.push('--use-angle=swiftshader', '--enable-unsafe-swiftshader');
const chrome = spawn(CHROME, [...flags, 'about:blank'], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function json(path) {
  for (let i = 0; i < 300; i++) {
    try { return await (await fetch(`http://127.0.0.1:${PORT}${path}`)).json(); } catch { await sleep(150); }
  }
  throw new Error('chrome did not answer');
}

let ws; let nextId = 1; const pending = new Map(); const listeners = [];
const consoleLog = [];
function send(method, params = {}) {
  const id = nextId++;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((res, rej) => pending.set(id, { res, rej, method }));
}

async function connect() {
  const targets = await json('/json');
  const page = targets.find((t) => t.type === 'page');
  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && pending.has(msg.id)) {
      const p = pending.get(msg.id); pending.delete(msg.id);
      if (msg.error) p.rej(new Error(`${p.method}: ${msg.error.message}`)); else p.res(msg.result);
    } else if (msg.method) {
      if (msg.method === 'Runtime.consoleAPICalled' && (msg.params.type === 'error' || msg.params.type === 'warning')) {
        consoleLog.push(`${msg.params.type}: ${msg.params.args.map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 300)}`);
      }
      if (msg.method === 'Runtime.exceptionThrown') {
        const d = msg.params.exceptionDetails;
        consoleLog.push(`exception: ${(d.exception?.description ?? d.text).slice(0, 500)}`);
      }
      for (const l of listeners) l(msg);
    }
  };
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  await send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});
}

async function ev(expr, { await: awaitPromise = true } = {}) {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise, returnByValue: true, userGesture: true });
  if (r.exceptionDetails) throw new Error(`eval: ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`);
  return r.result.value;
}

async function waitFor(expr, timeout = 30000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    try { if (await ev(`!!(${expr})`)) return true; } catch {}
    await sleep(100);
  }
  throw new Error(`timeout waiting for ${expr}`);
}

const KEYMAP = {
  Escape: { key: 'Escape', code: 'Escape', keyCode: 27 }, Enter: { key: 'Enter', code: 'Enter', keyCode: 13, text: '\r' },
  Space: { key: ' ', code: 'Space', keyCode: 32 }, Tab: { key: 'Tab', code: 'Tab', keyCode: 9 },
  ArrowUp: { key: 'ArrowUp', code: 'ArrowUp', keyCode: 38 }, ArrowDown: { key: 'ArrowDown', code: 'ArrowDown', keyCode: 40 },
  ArrowLeft: { key: 'ArrowLeft', code: 'ArrowLeft', keyCode: 37 }, ArrowRight: { key: 'ArrowRight', code: 'ArrowRight', keyCode: 39 },
  F3: { key: 'F3', code: 'F3', keyCode: 114 },
};
function keyDesc(k) {
  if (KEYMAP[k]) return KEYMAP[k];
  if (/^F\d+$/.test(k)) return { key: k, code: k, keyCode: 111 + Number(k.slice(1)) };
  if (/^[0-9]$/.test(k)) return { key: k, code: `Digit${k}`, keyCode: 48 + Number(k), text: k };
  if (/^[a-zA-Z]$/.test(k)) return { key: k, code: `Key${k.toUpperCase()}`, keyCode: k.toUpperCase().charCodeAt(0), text: k };
  if (k === '+') return { key: '+', code: 'Equal', keyCode: 187, text: '+' };
  if (k === '-') return { key: '-', code: 'Minus', keyCode: 189, text: '-' };
  return { key: k, code: k, keyCode: 0 };
}
async function key(k, { shift = false, ctrl = false } = {}) {
  const d = keyDesc(k);
  const modifiers = (shift ? 8 : 0) | (ctrl ? 2 : 0);
  await send('Input.dispatchKeyEvent', { type: d.text ? 'keyDown' : 'rawKeyDown', key: d.key, code: d.code, windowsVirtualKeyCode: d.keyCode, text: d.text, modifiers });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: d.key, code: d.code, windowsVirtualKeyCode: d.keyCode, modifiers });
  await sleep(60);
}
async function mouse(type, x, y, { button = 'left', clickCount = 1, modifiers = 0 } = {}) {
  await send('Input.dispatchMouseEvent', { type, x, y, button: type === 'mouseMoved' ? 'none' : button, clickCount, modifiers });
}
async function click(x, y, opts = {}) {
  await mouse('mouseMoved', x, y);
  await mouse('mousePressed', x, y, opts);
  await mouse('mouseReleased', x, y, opts);
  await sleep(80);
}
/** Seçicideki öğenin ortasına GERÇEK fare tıklaması (üstte başka öğe varsa ona gider — kasıtlı). */
async function clickSel(sel, opts = {}) {
  const r = await ev(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return null; el.scrollIntoView({block:'nearest'}); const r = el.getBoundingClientRect(); return {x: r.x + r.width/2, y: r.y + r.height/2, w: r.width, h: r.height}; })()`);
  if (!r) throw new Error(`clickSel: no element ${sel}`);
  // Tıklama noktasında gerçekte hangi öğe var? (örtülme tespiti)
  const top = await ev(`(() => { const el = document.elementFromPoint(${r.x}, ${r.y}); const t = document.querySelector(${JSON.stringify(sel)}); return { hit: el === t || t.contains(el), at: el ? (el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\\s+/).join('.') : '')) : null }; })()`);
  await click(r.x, r.y, opts);
  return { ...r, ...top };
}
async function hover(x, y) { await mouse('mouseMoved', x, y); await sleep(50); }
async function shot(name, clip = null, scale = 1) {
  const params = { format: 'png', captureBeyondViewport: false };
  if (clip) params.clip = { ...clip, scale };
  const r = await send('Page.captureScreenshot', params);
  const file = join(OUT, `${name}.png`);
  writeFileSync(file, Buffer.from(r.data, 'base64'));
  return file;
}
async function inject(path) { return ev(readFileSync(path, 'utf8')); }
/** Oyun saatini gerçek zamanlı akıt (ms). Başsızda rAF gerçek akar. */
async function run(ms, speed = 8) {
  await ev(`game.setSpeed(${speed})`);
  await sleep(ms);
  await ev('game.setSpeed(0)');
}
/** Haftaları senkron kapat (betik yolu, hızlı). */
async function weeks(n) { return ev(`(() => { for (let i = 0; i < ${n}; i++) game.endTurn(); return game.world.turn; })()`); }

async function boot() {
  await send('Page.navigate', { url: `${SERVER}/?seed=${encodeURIComponent(SEED)}${QUERY}` });
  await waitFor('window.game && game.world && document.querySelector("#nation-picker")', 60000);
  await sleep(300);
  // Önerilen ülkeyle oyna (picker'ın kendi düğmesi).
  await ev(`(() => { const b = document.querySelector('#nation-picker [data-play]'); if (b) b.click(); })()`);
  await waitFor('!document.body.classList.contains("picker-open")', 10000).catch(() => {});
  await sleep(500);
}

const hx = {
  W, H, SEED, OUT, PORT, ev, waitFor, key, click, clickSel, hover, mouse, shot, inject, run, weeks, sleep, send,
  consoleLog, listeners,
  probes: resolve(import.meta.dirname),
};

let result; let error = null;
try {
  await json('/json/version');
  await connect();
  if (!args['no-boot']) await boot();
  const planPath = resolve(args.plan);
  const plan = (await import(pathToFileURL(planPath).href)).default;
  result = await plan(hx);
} catch (e) {
  error = String(e?.stack ?? e);
} finally {
  try { ws?.close(); } catch {}
  chrome.kill();
  await sleep(300);
  try { rmSync(profile, { recursive: true, force: true }); } catch {}
}
process.stdout.write(JSON.stringify({ viewport: `${W}x${H}`, seed: SEED, error, console: consoleLog.slice(0, 40), result }, null, 1));
process.stdout.write('\n');
process.exit(0);
