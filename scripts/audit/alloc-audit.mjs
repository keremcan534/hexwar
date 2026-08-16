// TAHSISAT DENETIMI — haftalik simulasyon turunun bellek tahsisat profili.
//
// Iddia: hicbir tahsisat "tahminle" optimize edilmez; once olculur.
// Olcum araci: V8 ornekleyici heap profilcisi (inspector protokolu),
// toplanan (GC edilen) nesneler DAHIL — yani rapor edilen bayt, canli kalan
// degil TOPLAM tahsisattir. Ornekleme araligi 4 KB: ~%2-3 hata payi.
//
// Kullanim:
//   node scripts/audit/alloc-audit.mjs [hafta] [tohum] [--small] [--top=N]
//
// Varsayilan: standart dunya 160x96 (tarayicidaki ~11 MB/hafta olcumuyle ayni
// olcek), 20 hafta isinma + 10 hafta profil. --small denetim boyutunu (78x62)
// kullanir; kiyaslama icin.

import { Session } from 'node:inspector/promises';
import { headless, run } from './harness.mjs';

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const flags = new Set(process.argv.slice(2).filter((a) => a.startsWith('--')));
const WEEKS = Math.max(1, Number.parseInt(args[0] ?? '10', 10));
const SEED = args[1] ?? 'alloc-audit';
const WARMUP = 20;
const TOP = Number.parseInt(
  [...flags].find((f) => f.startsWith('--top='))?.slice(6) ?? '40', 10,
);
const SIZE = flags.has('--small') ? {} : { cols: 160, rows: 96 };

// Dosya -> alt sistem esleme tablosu. Profil agaci cagri yigini tabanlidir;
// bir dugumun bayti, TAHSISATI YAPAN karenin dosyasina yazilir.
const SUBSYSTEM = [
  [/game\/economy\.js/, 'economy'],
  [/game\/population\.js/, 'population'],
  [/game\/census\.js/, 'population'],
  [/game\/tradeLedger\.js/, 'trade-ledger'],
  [/game\/cities\.js/, 'cities/budget'],
  [/game\/ai\.js/, 'ai'],
  [/game\/command\.js/, 'command'],
  [/game\/movement\.js/, 'movement'],
  [/core\/pathfind\.js/, 'pathfind'],
  [/game\/battles\.js/, 'battles'],
  [/game\/units\.js/, 'units'],
  [/game\/recruitment\.js/, 'recruitment'],
  [/game\/reinforcement\.js/, 'reinforcement'],
  [/game\/provinces\.js/, 'provinces'],
  [/game\/construction\.js/, 'construction'],
  [/game\/politics\.js/, 'politics'],
  [/game\/diplomacy\.js/, 'diplomacy'],
  [/game\/infamy\.js/, 'infamy'],
  [/game\/peace\.js/, 'peace'],
  [/game\/orders\.js/, 'orders'],
  [/game\/hegemony\.js/, 'hegemony'],
  [/game\/control\.js/, 'control'],
  [/game\/turn\.js/, 'turn-loop'],
  [/game\/game\.js/, 'game'],
  [/game\/save\.js/, 'save'],
  [/core\/rng\.js/, 'rng'],
  [/core\/hex\.js/, 'hex'],
  [/world\//, 'world'],
];

function subsystemOf(url) {
  if (!url) return '(v8/none)';
  for (const [re, name] of SUBSYSTEM) if (re.test(url)) return name;
  if (url.includes('alloc-audit') || url.includes('harness')) return '(harness)';
  return `(other) ${url.split('/').slice(-1)[0]}`;
}

function shortUrl(url) {
  const i = url.lastIndexOf('/src/');
  return i >= 0 ? url.slice(i + 1) : url.split('/').slice(-2).join('/');
}

// Profil agacini duzlestir: dugum bayti = selfSize (o karede yapilan tahsisat).
function flatten(node, out, stack) {
  const frame = node.callFrame;
  stack.push(frame);
  if (node.selfSize > 0) {
    out.push({
      selfSize: node.selfSize,
      fn: frame.functionName || '(anonim)',
      url: frame.url,
      line: frame.lineNumber + 1,
      // Atif icin en yakin src/ karesi: tahsisat Array.prototype.map gibi
      // yerlesik icinde gorunse de sorumlu cagiran koddur.
      owner: [...stack].reverse().find((f) => f.url.includes('/src/')) ?? frame,
    });
  }
  for (const child of node.children) flatten(child, out, stack);
  stack.pop();
}

const game = headless(SEED, SIZE);
const world = game.world;
console.log(`dunya ${world.cols}x${world.rows}, ${world.nations.length} ulus, `
  + `${world.provinces?.length ?? 0} province, ${world.units.length} birim`);
console.log(`isinma ${WARMUP} hafta...`);
run(game, WARMUP);
console.log(`birim ${world.units.length}, sehir ${world.cities.length} — profil ${WEEKS} hafta basliyor`);

const session = new Session();
session.connect();
await session.post('HeapProfiler.enable');
await session.post('HeapProfiler.startSampling', {
  samplingInterval: 4096,
  includeObjectsCollectedByMajorGC: true,
  includeObjectsCollectedByMinorGC: true,
});

const t0 = performance.now();
run(game, WEEKS);
const elapsed = performance.now() - t0;

const { profile } = await session.post('HeapProfiler.stopSampling');
session.disconnect();

const leaves = [];
flatten(profile.head, leaves, []);

const totalBytes = leaves.reduce((s, l) => s + l.selfSize, 0);
const MB = 1024 * 1024;

// --- alt sistem dokumu (sahip kareye gore: yerlesikler cagirana yazilir) ---
const bySubsystem = new Map();
for (const leaf of leaves) {
  const key = subsystemOf(leaf.owner.url);
  bySubsystem.set(key, (bySubsystem.get(key) ?? 0) + leaf.selfSize);
}

console.log(`\n=== TOPLAM: ${(totalBytes / MB).toFixed(1)} MB / ${WEEKS} hafta = `
  + `${(totalBytes / MB / WEEKS).toFixed(2)} MB/hafta (${(elapsed / WEEKS).toFixed(0)} ms/hafta) ===\n`);

console.log('ALT SISTEM DOKUMU (MB/hafta):');
const rows = [...bySubsystem.entries()].sort((a, b) => b[1] - a[1]);
for (const [name, bytes] of rows) {
  const perWeek = bytes / MB / WEEKS;
  if (perWeek < 0.005) continue;
  console.log(`  ${name.padEnd(24)} ${perWeek.toFixed(2).padStart(7)}  (${(100 * bytes / totalBytes).toFixed(1)}%)`);
}

// --- en pahali tahsisat yerleri (sahip kare + gercek tahsisat karesi) ---
const bySite = new Map();
for (const leaf of leaves) {
  const o = leaf.owner;
  const site = `${o.functionName || '(anonim)'} @ ${shortUrl(o.url)}:${o.lineNumber + 1}`;
  const rec = bySite.get(site) ?? { bytes: 0, via: new Map() };
  rec.bytes += leaf.selfSize;
  const viaKey = leaf.url === o.url && leaf.line === o.lineNumber + 1
    ? '(dogrudan)' : `${leaf.fn}`;
  rec.via.set(viaKey, (rec.via.get(viaKey) ?? 0) + leaf.selfSize);
  bySite.set(site, rec);
}

console.log(`\nEN PAHALI ${TOP} TAHSISAT YERI (KB/hafta):`);
const sites = [...bySite.entries()].sort((a, b) => b[1].bytes - a[1].bytes).slice(0, TOP);
for (const [site, rec] of sites) {
  const via = [...rec.via.entries()].sort((a, b) => b[1] - a[1])
    .slice(0, 3).map(([k, v]) => `${k} ${(v / 1024 / WEEKS).toFixed(0)}K`).join(', ');
  console.log(`  ${(rec.bytes / 1024 / WEEKS).toFixed(0).padStart(7)}  ${site}`);
  if (via && via !== '(dogrudan)') console.log(`           via: ${via}`);
}
