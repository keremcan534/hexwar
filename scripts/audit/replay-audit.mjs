// TEKRAR KAYDI DENETİMİ — sınır tarihi doğru mu, ucuz mu, zararsız mı?
//
//   node scripts/audit/replay-audit.mjs [TOHUM] [YIL|full] [SÜTUN SATIR]
//   npm run audit:replay                              (78×62, 12 yıl: hızlı)
//   node scripts/audit/replay-audit.mjs REPLAY1 full 160 96   (tam kampanya)
//
// Beş soru, beşi de ölçümle:
//   1. Kare kare doğru mu: her ayın gerçek sahipleri, savaşları, yaşayan
//      ulusları kayıttan çözülenle bire bir aynı mı (bağımsız kopyaya karşı)?
//   2. Kayda en çok %5 mi ekliyor?
//   3. Hafta kapanışına yük bindiriyor mu?
//   4. Simülasyonu değiştiriyor mu: kaydedici kapalı koşuyla parmak izi aynı mı?
//   5. Kaydet-yükle tekrarı bozuyor mu; tekrarı olmayan eski kayıt açılıyor mu?

import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  finding, headless, n1, n2, reportFindings, section, sub, table,
} from './harness.mjs';
import { extendedFingerprint, fingerprintHash, worldFingerprint } from './fingerprint.mjs';
import { TurnManager } from '../../src/game/turn.js';
import { deserialize, serialize } from '../../src/game/save.js';
import {
  CAMPAIGN_TURNS, START_YEAR, monthLabel, monthOfTurn, turnOfYear,
} from '../../src/game/calendar.js';
import {
  REPLAY_EVENT, decodeReplay, replayHeadlines, replayRow, restoreReplay,
} from '../../src/game/replay.js';
import { WAR } from '../../src/game/diplomacy.js';

const HERE = fileURLToPath(import.meta.url);
const TMP = join(dirname(HERE), '_tmp');
mkdirSync(TMP, { recursive: true });

const MODES = new Set(['--on', '--off', '--resume', '--legacy']);
const mode = MODES.has(process.argv[2]) ? process.argv[2] : null;
const args = mode ? process.argv.slice(3) : process.argv.slice(2);
const SEED = args[0] ?? 'REPLAY1';
const YEARS = args[1] ?? '12';
const COLS = Number(args[2] ?? 78);
const ROWS = Number(args[3] ?? 62);
const WEEKS = YEARS === 'full' ? CAMPAIGN_TURNS - 1 : turnOfYear(START_YEAR + Number(YEARS)) - 1;
const MIDPOINT = Math.floor(WEEKS / 2);
const SAVE_FILE = join(TMP, `replay-audit-${SEED}-${COLS}x${ROWS}-mid.json`);
const SIZE_LIMIT = 0.05;

const newGame = () => headless(SEED, { cols: COLS, rows: ROWS });
const simPrint = (game) => fingerprintHash(`${worldFingerprint(game)}\n${extendedFingerprint(game)}`);

// ------------------------------------------------------------ ALT SÜREÇLER ---
if (mode) {
  if (mode === '--off') TurnManager.prototype.recordReplay = () => {};
  const game = newGame();
  let done = 0;
  if (mode === '--resume' || mode === '--legacy') {
    const data = JSON.parse(readFileSync(SAVE_FILE, 'utf8'));
    if (mode === '--legacy') delete data.replay;
    if (!deserialize(game, data)) {
      process.stdout.write(JSON.stringify({ error: 'deserialize basarisiz' }));
      process.exit(0);
    }
    done = MIDPOINT;
  }
  const t0 = performance.now();
  for (let week = done; week < WEEKS; week++) game.turns.endTurn();
  const replay = game.world.replay;
  process.stdout.write(JSON.stringify({
    ms: performance.now() - t0,
    print: simPrint(game),
    start: replay?.start ?? null,
    frames: replay?.frames ?? null,
    base: replay?.base ?? null,
    log: mode === '--off' ? null : replay?.log ?? null,
  }));
  process.exit(0);
}

function child(flag) {
  return new Promise((resolve, reject) => {
    const proc = spawn(process.execPath, [HERE, flag, SEED, YEARS, String(COLS), String(ROWS)], {
      stdio: ['ignore', 'pipe', 'inherit'],
    });
    let out = '';
    proc.stdout.setEncoding('utf8');
    proc.stdout.on('data', (chunk) => { out += chunk; });
    proc.on('error', reject);
    proc.on('close', () => {
      try { resolve(JSON.parse(out)); } catch (err) { resolve({ error: `${flag} cikti vermedi` }); }
    });
  });
}

// ---------------------------------------------------------------- ANA KOŞU ---
section(`TEKRAR KAYDI · tohum ${SEED} · ${COLS}x${ROWS} · ${WEEKS} hafta`);

// Karşılaştırma koşuları aynı koşullarda ve paralel: hafta süresi farkı anlamlı olsun.
const onRun = child('--on');
const offRun = child('--off');

const game = newGame();
const world = game.world;

/** Kaydediciden bağımsız gerçek: her yeni ayın sahipleri, savaşları, yaşayanları. */
function observe() {
  const owners = Int16Array.from(world.provinces, (province) => province.owner);
  const wars = new Set();
  const alive = new Set();
  for (const nation of world.nations) {
    if (!nation.alive) continue;
    alive.add(nation.id);
    for (const other of world.nations) {
      if (other.id > nation.id && other.alive && world.relations[nation.id]?.[other.id]?.state === WAR) {
        wars.add(`${nation.id}-${other.id}`);
      }
    }
  }
  return { month: monthOfTurn(world.turn), owners, wars, alive };
}

const truth = [observe()];
const profile = {};
let worstReplay = 0;
/** Kare yazılan haftaların kaydedici süresi: ortalama tek başına kuyruğu gizler. */
const frameMs = [];
let resumeRun = null;
let legacyRun = null;
for (let week = 0; week < WEEKS; week++) {
  game.turns.endTurn();
  for (const [phase, ms] of Object.entries(game.turns.lastProfile ?? {})) {
    profile[phase] = (profile[phase] ?? 0) + ms;
  }
  worstReplay = Math.max(worstReplay, game.turns.lastProfile?.replay ?? 0);
  if (monthOfTurn(world.turn) !== truth[truth.length - 1].month) {
    frameMs.push(game.turns.lastProfile?.replay ?? 0);
    truth.push(observe());
  }
  if (week + 1 === MIDPOINT) {
    writeFileSync(SAVE_FILE, JSON.stringify(serialize(game)));
    resumeRun = child('--resume');
    legacyRun = child('--legacy');
  }
}

// 1) Kare kare doğruluk ------------------------------------------------------
sub('1. Kare kare dogruluk (bagimsiz gercege karsi)');
const decoded = decodeReplay(world);
{
  let wrongOwners = 0;
  let wrongWars = 0;
  let wrongAlive = 0;
  let wrongCount = 0;
  const wars = new Set(truth[0].wars);
  const alive = new Set(truth[0].alive);
  let cursor = 0;
  const key = (a, b) => `${Math.min(a, b)}-${Math.max(a, b)}`;
  const lastFrame = decoded.frames - 1;
  for (let frame = 0; frame < lastFrame; frame++) {
    for (; cursor < decoded.events.length && decoded.events[cursor].frame === frame; cursor++) {
      const { kind, a, b } = decoded.events[cursor];
      if (kind === REPLAY_EVENT.WAR) wars.add(key(a, b));
      else if (kind === REPLAY_EVENT.PEACE) wars.delete(key(a, b));
      else if (kind === REPLAY_EVENT.BORN) alive.add(a);
      else if (kind === REPLAY_EVENT.FALL) alive.delete(a);
    }
    const real = truth[frame];
    const row = replayRow(decoded, frame);
    if (row.some((owner, id) => owner !== real.owners[id])) wrongOwners++;
    if (wars.size !== real.wars.size || [...wars].some((pair) => !real.wars.has(pair))) wrongWars++;
    if (alive.size !== real.alive.size || [...alive].some((id) => !real.alive.has(id))) wrongAlive++;
    if (decoded.wars[frame] !== real.wars.size) wrongCount++;
  }
  const live = replayRow(decoded, lastFrame);
  const wrongLive = world.provinces.filter((province, id) => province.owner !== live[id]).length;
  const months = monthOfTurn(world.turn) - monthOfTurn(1) + 1;
  console.log(`  kare ${decoded.frames} (beklenen ${months}) · ${monthLabel(decoded.start)} - ${monthLabel(decoded.start + lastFrame)}`);
  console.log(`  yanlis kare: sahip ${wrongOwners} · savas ${wrongWars} · yasayan ${wrongAlive} · sayac ${wrongCount} · canli son karede ${wrongLive} province`);
  if (decoded.frames !== months) {
    finding('CRITICAL', 'Ay kacti', `${months} kare`, `${decoded.frames} kare`);
  }
  if (wrongOwners || wrongWars || wrongAlive || wrongCount || wrongLive) {
    finding('CRITICAL', 'Tekrar gercekle uyusmuyor', 'her kare bire bir ayni',
      `sahip ${wrongOwners}, savas ${wrongWars}, yasayan ${wrongAlive}, sayac ${wrongCount}, son kare ${wrongLive}`);
  } else {
    console.log('  OK  butun kareler gercekle bire bir ayni, son kare canli dunya.');
  }
  const headlines = replayHeadlines(world, decoded, -1);
  const kinds = {};
  for (const entry of headlines) kinds[entry.kind] = (kinds[entry.kind] ?? 0) + 1;
  const count = (kind) => decoded.events.filter((event) => event.kind === kind).length;
  console.log(`  ham olay: savas ${count(REPLAY_EVENT.WAR)} · baris ${count(REPLAY_EVENT.PEACE)} · dogus ${count(REPLAY_EVENT.BORN)} · yikilis ${count(REPLAY_EVENT.FALL)}`);
  console.log(`  baslik: ${headlines.length} ${JSON.stringify(kinds)}`);
  for (const entry of headlines.slice(0, 5)) {
    console.log(`    ${monthLabel(decoded.start + entry.frame)}: ${entry.title}${entry.detail ? ` (${entry.detail})` : ''}`);
  }
  // Akış dört türü de anlatmalı: ağırlık sıralaması küçük ulusları silebiliyor.
  const lost = [['war', REPLAY_EVENT.WAR], ['peace', REPLAY_EVENT.PEACE], ['born', REPLAY_EVENT.BORN], ['fall', REPLAY_EVENT.FALL]]
    .filter(([name, kind]) => count(kind) > 0 && !kinds[name]).map(([name]) => name);
  if (lost.length) {
    finding('HIGH', 'Olay turu akistan dusuyor', 'ham kayitta olan her tur basliklarda gorunmeli', lost.join(', '));
  }
}

// 2) Kayıt boyu --------------------------------------------------------------
sub('2. Kayit boyu');
const sizes = (() => {
  const data = serialize(game);
  const full = JSON.stringify(data).length;
  const replay = JSON.stringify(data.replay).length;
  const without = JSON.stringify({ ...data, replay: null }).length;
  return {
    full, without, replay, added: full - without, share: (full - without) / without,
    base: data.replay.base.length, log: data.replay.log.length,
  };
})();
console.log(`  kayit ${sizes.without.toLocaleString('en')} karakter · tekrar +${sizes.added.toLocaleString('en')} (taban ${sizes.base}, akis ${sizes.log}) = %${n2(sizes.share * 100)} (sinir %${SIZE_LIMIT * 100})`);
console.log(`  ay basina ${n1(sizes.log / Math.max(1, decoded.frames - 1))} karakter`);
if (sizes.share > SIZE_LIMIT) {
  finding('HIGH', 'Tekrar kaydi sisiriyor', `en cok %${SIZE_LIMIT * 100}`, `%${n2(sizes.share * 100)}`);
}

// 3-5) Karşılaştırma koşuları -------------------------------------------------
const [on, off, resumed, legacy] = await Promise.all([onRun, offRun, resumeRun, legacyRun]);

sub('3. Hafta kapanisi yuku');
const weekMs = Object.values(profile).reduce((sum, ms) => sum + ms, 0);
const replayMs = profile.replay ?? 0;
const perWeek = (replayMs / WEEKS) * 1000;
const sortedFrames = [...frameMs].sort((a, b) => a - b);
const frameQuantile = (q) => (sortedFrames[Math.floor((sortedFrames.length - 1) * q)] ?? 0) * 1000;
console.log(table([
  { what: 'hafta (faz profili toplami)', value: `${n2(weekMs / WEEKS)} ms` },
  { what: 'kaydedici, hafta ortalamasi', value: `${n2(perWeek)} us` },
  { what: 'kare yazilan hafta, ortanca', value: `${n2(frameQuantile(0.5))} us` },
  { what: 'kare yazilan hafta, %99', value: `${n2(frameQuantile(0.99))} us` },
  { what: 'kaydedici, en kotu hafta', value: `${n2(worstReplay * 1000)} us` },
  { what: 'kaydedicinin payi', value: `%${(replayMs / weekMs * 100).toFixed(4)}` },
  { what: 'esli kosu: kaydedici acik', value: `${n1(on.ms / WEEKS)} ms/hafta` },
  { what: 'esli kosu: kaydedici kapali', value: `${n1(off.ms / WEEKS)} ms/hafta` },
  { what: 'esli kosu farki (paralel, gurultulu)', value: `%${n2((on.ms - off.ms) / off.ms * 100)}` },
], [
  { label: 'olcu', get: (row) => row.what, right: false },
  { label: 'deger', get: (row) => row.value },
]));
if (replayMs / weekMs > 0.002) {
  finding('HIGH', 'Kaydedici hafta kapanisina yuk bindiriyor', 'payi %0.2 altinda', `%${n2(replayMs / weekMs * 100)}`);
}

sub('4. Simulasyon degismedi mi (kaydedici acik / kapali)');
const mainPrint = simPrint(game);
console.log(`  ana ${mainPrint} · acik ${on.print} · kapali ${off.print}`);
if (mainPrint !== off.print || on.print !== off.print) {
  finding('CRITICAL', 'Kaydedici simulasyonu degistiriyor', 'parmak izleri ayni', `${mainPrint} / ${on.print} / ${off.print}`);
} else {
  console.log('  OK  uc kosunun parmak izi ayni: kaydedici yalniz okuyor.');
}

sub('5. Kaydet-yukle ve eski kayit');
{
  const live = world.replay;
  const prefix = (text, other) => {
    let at = 0;
    while (at < text.length && at < other.length && text[at] === other[at]) at++;
    return at;
  };
  console.log(`  yuklenip devam eden kosu: parmak izi ${resumed.print === mainPrint ? 'ayni' : 'FARKLI'} · akis ${resumed.log === live.log ? 'ayni' : `FARKLI (ortak ${prefix(resumed.log ?? '', live.log)}/${live.log.length})`} · kare ${resumed.frames}`);
  if (resumed.error) finding('CRITICAL', 'Tekrarli kayit yuklenmiyor', 'yuklenmeli', resumed.error);
  else if (resumed.print === mainPrint && resumed.log !== live.log) {
    finding('CRITICAL', 'Kaydet-yukle tekrari bozuyor', 'ayni simulasyon ayni akisi yazmali', 'akislar farkli');
  } else if (resumed.print !== mainPrint) {
    finding('MEDIUM', 'Kaydet-yukle simulasyonu dallandi', 'audit:save temiz olmali', `${resumed.print} / ${mainPrint}`);
  }
  const midMonth = monthOfTurn(MIDPOINT + 1);
  const legacyFrames = monthOfTurn(world.turn) - midMonth + 1;
  console.log(`  tekrari olmayan kayit: parmak izi ${legacy.print === mainPrint ? 'ayni' : 'FARKLI'} · basladigi ay ${monthLabel(legacy.start ?? 0)} (beklenen ${monthLabel(midMonth)}) · kare ${legacy.frames}/${legacyFrames}`);
  if (legacy.error) finding('CRITICAL', 'Eski kayit yuklenmiyor', 'tekrari olmayan kayit acilmali', legacy.error);
  else if (legacy.start !== midMonth || legacy.frames !== legacyFrames) {
    finding('HIGH', 'Eski kayitta tekrar yanlis basliyor', `${midMonth} / ${legacyFrames}`, `${legacy.start} / ${legacy.frames}`);
  } else if (legacy.print !== mainPrint) {
    finding('MEDIUM', 'Eski kayit yuklemesi simulasyonu dallandi', 'parmak izi ayni', `${legacy.print} / ${mainPrint}`);
  } else {
    console.log('  OK  eski kayit temiz aciliyor, tekrar yukleme ayindan basliyor.');
  }

  // Bozuk alan kampanyayı düşürmez: kayıt o aydan yeniden başlar.
  const good = JSON.parse(JSON.stringify(live));
  const month = monthOfTurn(world.turn);
  const broken = [
    ['kesik akis', { ...good, log: good.log.slice(0, -2), frames: good.frames + 3 }],
    ['yabanci karakter', { ...good, log: `!${good.log}` }],
    ['yanlis bicim', { ...good, format: 99 }],
    ['bos alan', 'replay'],
  ];
  const bad = broken.filter(([, saved]) => {
    const replay = restoreReplay(world, saved);
    return replay.start !== month || replay.frames !== 1;
  });
  console.log(`  bozuk tekrar alani: ${broken.length - bad.length}/${broken.length} temiz yeniden baslar`);
  if (bad.length) finding('HIGH', 'Bozuk tekrar alani temiz dusmuyor', 'yeniden baslamali', bad.map(([name]) => name).join(', '));
}

writeFileSync(join(TMP, `replay-audit-${SEED}-${COLS}x${ROWS}.json`), JSON.stringify({
  seed: SEED, cols: COLS, rows: ROWS, weeks: WEEKS, frames: decoded.frames,
  sizes, weekMs: weekMs / WEEKS, replayUsPerWeek: perWeek, worstReplayUs: worstReplay * 1000,
  frameMedianUs: frameQuantile(0.5), frameP99Us: frameQuantile(0.99),
  replayShare: replayMs / weekMs, onMsPerWeek: on.ms / WEEKS, offMsPerWeek: off.ms / WEEKS,
  sameSim: mainPrint === off.print, resumedSame: resumed.print === mainPrint && resumed.log === world.replay?.log,
}, null, 1));

process.exit(reportFindings() > 0 ? 1 : 0);
