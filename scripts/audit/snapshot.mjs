// DONDURULMUŞ ANLIK GÖRÜNTÜ — A/B ölçümünün sabit zemini (TASARIM §5 "Denetim").
//
// Neden: aynı tohum, paralel oturumlar src'yi değiştirirken %6.1'den %5.1'e
// kaydı (audit:homeland, 2026-10-15 09:22 → 10:45; kod okumak değil koşu
// kanıtladı). İki kolun farkı ancak İKİSİ DE aynı kodu koşarsa kolun etkisidir.
// Bu betik çalışma ağacının O ANKİ hâlini (işlenmemiş değişiklikler ve git'e
// eklenmemiş dosyalar dahil, .gitignore'dakiler hariç) bir klasöre kopyalar;
// her denetim oradan koşabilir ve sonuç o kopyanın içine yazılır.
//
// git archive yalnız işlenmiş ağacı verir; Tek Çubuk ekonomisi gibi büyük
// işlenmemiş iş dururken o kopya yanlış kodu ölçer. Bu yüzden dosya listesi
// `git ls-files --cached --others --exclude-standard` ile alınır ve dosyalar
// diskten okunur. Git'e hiçbir şey yazılmaz (stash/add/commit yok).
//
//   node scripts/audit/snapshot.mjs create AD [--root KLASÖR] [--full] [--force]
//   node scripts/audit/snapshot.mjs run AD DENETİM [argümanlar...]   (ör. homeland, war-support, peoples-audit.mjs)
//   node scripts/audit/snapshot.mjs path AD
//   node scripts/audit/snapshot.mjs list [--root KLASÖR]
//
// Kök: --root, yoksa HEXWAR_SNAPSHOTS ortam değişkeni, yoksa işletim
// sisteminin geçici klasörü altında hexwar-snapshots. Varsayılan kopya oyunun
// koşması için gereken her şeydir; assets/ (50 MB yazı tipi ve görsel) ve
// trailer/ (2 GB fragman çekimi) başsız simülasyonca okunmaz ve atlanır
// (--full ikisini de alır).

import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..');
// Başsız koşunun okumadığı büyük klasörler (ölçüldü: assets 50 MB, trailer 2 GB).
const HEAVY = ['assets/', 'trailer/'];

function parseArgs(argv) {
  const flags = {};
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--root') flags.root = argv[++i];
    else if (a === '--full') flags.full = true;
    else if (a === '--force') flags.force = true;
    else rest.push(a);
  }
  return { flags, rest };
}

/** Başsız simülasyonun yüklediği dosya mı (src/ui ve .css hariç src). */
const isSimFile = (path) => path.startsWith('src/') && !path.startsWith('src/ui/') && !path.endsWith('.css');

const rootOf = (flags) => resolve(flags.root ?? process.env.HEXWAR_SNAPSHOTS ?? join(tmpdir(), 'hexwar-snapshots'));
const git = (...args) => execFileSync('git', args, { cwd: REPO, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

/** Çalışma ağacının dosyaları: izlenen + izlenmeyen (yok sayılmayan), silinenler hariç. */
function workingTreeFiles(full) {
  const list = git('ls-files', '-z', '--cached', '--others', '--exclude-standard')
    .split('\0').filter(Boolean);
  const unique = [...new Set(list)].sort();
  return unique.filter((path) => {
    if (!full && HEAVY.some((dir) => path.startsWith(dir))) return false;
    // Silinmiş ama henüz işlenmemiş dosya listede durur: diskte yoksa atla.
    const abs = join(REPO, path);
    return existsSync(abs) && statSync(abs).isFile();
  });
}

function create(name, flags) {
  if (!name || /[\\/]/.test(name)) throw new Error('anlık görüntü adı gerekli (klasör ayıracı içermez)');
  const dest = join(rootOf(flags), name);
  if (existsSync(dest)) {
    if (!flags.force) {
      throw new Error(`${dest} zaten var — dondurulmuş zemin üzerine yazılmaz (bilerek yenilemek için --force)`);
    }
    rmSync(dest, { recursive: true, force: true });
  }
  const files = workingTreeFiles(flags.full);
  const hash = createHash('sha256');
  // Yalnız src/: iki kopyanın SİMÜLASYONU aynı mı? Denetim betiği değişse
  // bile src özeti aynıysa ölçülen oyun aynıdır. simHash ayrıca src/ui ve
  // stil dosyalarını dışarıda bırakır: başsız koşu onları hiç yüklemez ve
  // paralel arayüz oturumları (2026-10-15: ana menü) onları sık değiştirir.
  const srcHash = createHash('sha256');
  const simHash = createHash('sha256');
  let bytes = 0;
  for (const path of files) {
    const from = join(REPO, path);
    const to = join(dest, path);
    mkdirSync(dirname(to), { recursive: true });
    copyFileSync(from, to);
    const content = readFileSync(from);
    bytes += content.length;
    // Yol + içerik: aynı içerikli iki kopya aynı kimliği alır, hangi makinede olursa olsun.
    hash.update(path).update('\0').update(content).update('\0');
    if (path.startsWith('src/')) srcHash.update(path).update('\0').update(content).update('\0');
    if (isSimFile(path)) simHash.update(path).update('\0').update(content).update('\0');
  }
  const status = git('status', '--porcelain').split('\n').filter(Boolean);
  const manifest = {
    name,
    created: new Date().toISOString(),
    repo: REPO,
    head: git('rev-parse', 'HEAD').trim(),
    branch: git('branch', '--show-current').trim(),
    dirty: status.length,
    status,
    files: files.length,
    bytes,
    full: Boolean(flags.full),
    contentHash: hash.digest('hex'),
    srcHash: srcHash.digest('hex'),
    simHash: simHash.digest('hex'),
  };
  writeFileSync(join(dest, 'SNAPSHOT.json'), `${JSON.stringify(manifest, null, 1)}\n`);
  return { dest, manifest };
}

/** Denetim adı → betik yolu: "homeland" → homeland-audit.mjs; tam ad ya da yol da olur. */
function scriptOf(snap, audit) {
  const candidates = [
    join(snap, audit),
    join(snap, 'scripts', 'audit', audit),
    join(snap, 'scripts', 'audit', `${audit}.mjs`),
    join(snap, 'scripts', 'audit', `${audit}-audit.mjs`),
  ];
  const hit = candidates.find((path) => existsSync(path) && statSync(path).isFile());
  if (!hit) throw new Error(`denetim bulunamadı: ${audit} (${snap})`);
  return hit;
}

function run(name, audit, args, flags) {
  const snap = join(rootOf(flags), name);
  if (!existsSync(join(snap, 'SNAPSHOT.json'))) throw new Error(`anlık görüntü yok: ${snap}`);
  const script = scriptOf(snap, audit);
  // Çalışma klasörü kopyanın kökü: göreli çıktı yolu yazan betikler
  // (scripts/audit/_tmp/...) kopyanın içine yazar, canlı ağaca değil.
  const out = spawnSync(process.execPath, [script, ...args], { cwd: snap, stdio: 'inherit' });
  return out.status ?? 1;
}

const { flags, rest } = parseArgs(process.argv.slice(2));
const [command, ...params] = rest;
try {
  if (command === 'create') {
    const { dest, manifest } = create(params[0], flags);
    console.log(`anlık görüntü: ${dest}`);
    console.log(`  HEAD ${manifest.head.slice(0, 7)} (${manifest.branch}) · işlenmemiş ${manifest.dirty} yol`
      + ` · ${manifest.files} dosya · ${(manifest.bytes / 1e6).toFixed(1)} MB · içerik ${manifest.contentHash.slice(0, 16)} · src ${manifest.srcHash.slice(0, 16)} · sim ${manifest.simHash.slice(0, 16)}`);
  } else if (command === 'run') {
    const [name, audit, ...args] = params;
    process.exit(run(name, audit, args, flags));
  } else if (command === 'path') {
    console.log(join(rootOf(flags), params[0]));
  } else if (command === 'list') {
    const root = rootOf(flags);
    if (!existsSync(root)) { console.log(`(boş) ${root}`); process.exit(0); }
    for (const entry of readdirSync(root)) {
      const file = join(root, entry, 'SNAPSHOT.json');
      if (!existsSync(file)) continue;
      const m = JSON.parse(readFileSync(file, 'utf8'));
      console.log(`${entry.padEnd(24)} ${m.created} HEAD ${m.head.slice(0, 7)} işlenmemiş ${m.dirty} içerik ${m.contentHash.slice(0, 16)} src ${(m.srcHash ?? '?').slice(0, 16)} sim ${(m.simHash ?? '?').slice(0, 16)}`);
    }
  } else {
    console.log('kullanım: snapshot.mjs create AD [--root K] [--full] [--force] | run AD DENETİM [arg...] | path AD | list');
    process.exit(command ? 1 : 0);
  }
} catch (error) {
  console.error(`snapshot: ${error.message}`);
  process.exit(1);
}
