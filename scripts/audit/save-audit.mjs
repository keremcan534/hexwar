// Y. KAYIT / YUKLEME DETERMINIZMI
//
// Uc soru:
//   1. Kayit -> yukle -> kayit turu kararli mi (hangi alanlar kaybolur)?
//   2. Ayni kayittan iki kez yuklenip 100 hafta isletilirse ayni sonuc mu?
//   3. Kaydetmeden devam etmekle, kaydedip yukleyip devam etmek ayni mi?

import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
  headless, run, section, sub, table, finding, reportFindings, n1, n2, n0, pct,
} from './harness.mjs';
import { serialize, deserialize, SAVE_VERSION } from '../../src/game/save.js';
import { extendedFingerprint } from './fingerprint.mjs';
import { passivePlayer } from './harness.mjs';
import { EVENT_CARDS, resolveCard } from '../../src/game/eventCards.js';
import { atWar, declareWar, hostile, warBlockers } from '../../src/game/diplomacy.js';
import { formAlliance } from '../../src/game/alliances.js';
import { postEnvoy, pushProposal } from '../../src/game/relations.js';
import { denounceNap, issueDemand, signNap } from '../../src/game/pacts.js';

const SEED = 'save-audit';
const HERE = dirname(fileURLToPath(import.meta.url));
const TMP = join(HERE, '_tmp');
mkdirSync(TMP, { recursive: true });
const SAVE_FILE = join(TMP, 'save-audit.json');

/**
 * Karsilastirilabilir, kompakt dunya parmak izi. Ekonomi Tek Cubuk'tur (kayit
 * surumu 27): fon, cikti, kalkinma kademesi toplami ve cubugun paylari.
 * Insaat kuyrugu yok (nation.construction kalkti).
 */
function fingerprint(game) {
  const world = game.world;
  const development = new Map();
  for (const province of world.provinces ?? []) {
    if (province.owner < 0 || !province.econ) continue;
    development.set(province.owner, (development.get(province.owner) ?? 0) + (province.econ.development ?? 1));
  }
  const nations = world.nations.filter((n) => n.alive).map((n) => [
    n.id,
    Number((n.fund ?? 0).toFixed(3)),
    n.tiles,
    (n.economy.ic?.output ?? 0).toFixed(3),
    (n.economy.ic?.total ?? 0).toFixed(3),
    development.get(n.id) ?? 0,
    ['bills', 'army', 'people', 'invest'].map((k) => (n.economy.alloc?.[k] ?? 0).toFixed(3)).join('/'),
    (n.economy.consumer?.ratio ?? 0).toFixed(4),
    Number((n.stability ?? 0).toFixed(6)),
    JSON.stringify(n.politics?.laws ?? {}), Number((n.power ?? 0).toFixed(3)),
    Number((n.warSupport ?? 0).toFixed(6)),
    world.units.filter((u) => u.nationId === n.id).length,
  ].join(','));
  let pop = 0;
  world.forEach((t) => { if (t.province) pop += t.province.population; });
  const prices = Object.entries(world.market.prices)
    .map(([id, price]) => `${id}=${price.toFixed(6)}`).join(';');
  const wars = [];
  for (let a = 0; a < world.nations.length; a++) {
    for (let b = a + 1; b < world.nations.length; b++) {
      if (world.relations[a]?.[b]?.state === 'war') wars.push(`${a}-${b}`);
    }
  }
  return {
    turn: world.turn,
    population: pop,
    units: world.units.length,
    cities: world.cities.length,
    battles: world.battleSystem?.battles?.length ?? 0,
    wars: wars.join(' '),
    nations: nations.join('|'),
    prices,
    // Yeniden tasarımın alanları (redesign §5, korumalı): destek, rota,
    // yorgunluk, savaş dengesi, Home Rule, hareket kayıtları, levée, milis.
    // Kayda girmeyen yeni alan kaydet-yükle sonrası burada ayrışır.
    peoples: extendedFingerprint(game),
  };
}

function diffFingerprints(a, b) {
  const out = [];
  for (const key of Object.keys(a)) {
    if (JSON.stringify(a[key]) !== JSON.stringify(b[key])) out.push(key);
  }
  return out;
}

// ------------------------------------------------- DİPLOMASİ SENARYOSU ---
// Şartname §18.2: masada açık çağrı, ittifak teklifi, bize talep, iki elçi,
// bitimine 10 hafta kalmış ve feshi bildirilmiş paktlar, verilen garanti,
// savaş gerekçesi, özerkliği 48 vassal, bekleyen YZ barış teklifi. Kaydet →
// yükle → 104 hafta; kesintisiz koşuyla aynı parmak izi ve aynı
// defter/masa/anlaşmalar.
const DIP_SEED = 'save-audit-dip';
const DIP_FILE = join(TMP, 'save-audit-dip.json');

/** Pasif oyuncunun haftalık işi (harness.passivePlayer'ın döngüsü; devir yeniden kurulmaz). */
function passiveWeek(game, player) {
  if (!player.alive) return;
  for (const entry of [...(player.cards?.pending ?? [])]) {
    const card = EVENT_CARDS[entry.id];
    let best = 0;
    let bestWeight = -Infinity;
    card.options.forEach((option, index) => {
      if (option.available && !option.available(player)) return;
      const w = option.ai ? option.ai(player) : 1;
      if (w > bestWeight) { best = index; bestWeight = w; }
    });
    resolveCard(game, player, entry.key, best);
  }
  for (const offer of [...game.pendingPeace()]) {
    if (offer.to === player.id) game.resolvePeaceOffer(offer.id, true);
  }
}

function diploSnapshot(game) {
  const world = game.world;
  return JSON.stringify({
    diplo: world.diplo,
    nations: world.nations.map((n) => [n.id, n.regard ?? {}, n.envoys ?? [], (n.treaties ?? [])
      .map((t) => JSON.stringify(t)).sort(), n.rivalChosen ?? null, n.rivalLockUntil ?? 0]),
    offers: game.peaceOffers ?? [],
  });
}

if (process.argv[2] === '--dip-worker') {
  const game = headless(DIP_SEED);
  const data = JSON.parse(readFileSync(DIP_FILE, 'utf8'));
  if (!deserialize(game, data)) {
    process.stdout.write(JSON.stringify({ error: 'deserialize basarisiz' }));
    process.exit(0);
  }
  const player = game.world.nations[game.turns.playerNation];
  const loaded = diploSnapshot(game);
  for (let i = 0; i < 104; i++) { game.turns.endTurn(); passiveWeek(game, player); }
  process.stdout.write(JSON.stringify({ loaded, after: fingerprint(game), diplo: diploSnapshot(game) }));
  process.exit(0);
}

// --------------------------------------------------------- ALT SUREC MODU ---
if (process.argv[2] === '--worker') {
  const weeks = Number(process.argv[3]);
  const game = headless(SEED);
  const data = JSON.parse(readFileSync(SAVE_FILE, 'utf8'));
  const ok = deserialize(game, data);
  if (!ok) {
    process.stdout.write(JSON.stringify({ error: 'deserialize basarisiz' }));
    process.exit(0);
  }
  const loaded = fingerprint(game);
  run(game, weeks);
  process.stdout.write(JSON.stringify({ loaded, after: fingerprint(game) }));
  process.exit(0);
}

const worker = (weeks) => JSON.parse(execFileSync(
  process.execPath,
  [fileURLToPath(import.meta.url), '--worker', String(weeks)],
  { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
));

// ------------------------------------------------------------------ TEST ---
section('Y. KAYIT / YUKLEME DETERMINIZMI');
console.log(`  tohum ${SEED} · kayit surumu ${SAVE_VERSION}`);

const game = headless(SEED);
run(game, 100);
const atSave = fingerprint(game);
const payload = serialize(game);
writeFileSync(SAVE_FILE, JSON.stringify(payload));
run(game, 100);
const continued = fingerprint(game);

// 1) Yapisal tur: kayit -> yukle -> kayit
sub('1. Kayit -> yukle -> kayit: hangi alanlar tasinmiyor?');
{
  const fresh = headless(SEED);
  const ok = deserialize(fresh, JSON.parse(readFileSync(SAVE_FILE, 'utf8')));
  console.log(`  deserialize sonucu: ${ok ? 'basarili' : 'BASARISIZ'}`);
  const again = serialize(fresh);
  const lost = [];
  const compare = (path, x, y) => {
    if (x === y) return;
    if (typeof x === 'number' && typeof y === 'number') {
      if (Math.abs(x - y) > 1e-6) lost.push(`${path}: ${n2(x)} -> ${n2(y)}`);
      return;
    }
    if (x && y && typeof x === 'object' && typeof y === 'object') {
      if (Array.isArray(x) !== Array.isArray(y)) { lost.push(`${path}: tur degisti`); return; }
      if (Array.isArray(x)) {
        if (x.length !== y.length) lost.push(`${path}.length: ${x.length} -> ${y.length}`);
        for (let i = 0; i < Math.min(x.length, y.length, 8); i++) compare(`${path}[${i}]`, x[i], y[i]);
        return;
      }
      const keys = new Set([...Object.keys(x), ...Object.keys(y)]);
      for (const k of keys) compare(`${path}.${k}`, x[k], y[k]);
      return;
    }
    lost.push(`${path}: ${JSON.stringify(x)} -> ${JSON.stringify(y)}`);
  };
  // Karsilastirma DISKTEKI kayda karsi yapilir. serialize() economy/politics
  // icin CANLI REFERANS dondurur; bellekteki `payload` nesnesi
  // sonraki turlarda yerinde degisir ve karsilastirmayi yalancilar.
  const onDisk = JSON.parse(readFileSync(SAVE_FILE, 'utf8'));
  for (const key of ['turn', 'playerNation', 'seed']) compare(key, onDisk[key], again[key]);
  compare('tiles', onDisk.tiles, again.tiles);
  compare('cities', onDisk.cities, again.cities);
  compare('units', onDisk.units, again.units);
  compare('nations', onDisk.nations, again.nations);
  const filtered = lost.filter((l) => !l.startsWith('savedAt'));
  console.log(`  tur farki sayisi: ${filtered.length}`);
  for (const line of filtered.slice(0, 25)) console.log(`    - ${line}`);
  if (filtered.length > 25) console.log(`    ... ve ${filtered.length - 25} tane daha`);

  // nation.tiles kayitta YOK ve yuklemede yeniden sayilmiyor: dunya uretimden
  // gelen baslangic degeri oldugu gibi kaliyor. Bu sayac YZ'nin ordu ve sehir
  // hedefini belirledigi icin (desiredArmy = 4 + tiles/12) sessiz bir bozulma.
  console.log('\n  nation.tiles sayaci (kayitta saklanmiyor):');
  const owned = (world, id) => {
    let n = 0;
    world.forEach((t) => { if (t.owner === id) n++; });
    return n;
  };
  console.log(table(game.world.nations.filter((n) => n.alive).slice(0, 8).map((n) => ({
    id: n.id,
    savedCounter: n.tiles,
    savedReal: owned(game.world, n.id),
    loadedCounter: fresh.world.nations[n.id]?.tiles ?? 0,
    loadedReal: owned(fresh.world, n.id),
  })), [
    { label: 'ulke', get: (r) => r.id },
    { label: 'kayitAninda sayac', get: (r) => r.savedCounter },
    { label: 'kayitAninda gercek', get: (r) => r.savedReal },
    { label: 'yuklemede sayac', get: (r) => r.loadedCounter },
    { label: 'yuklemede gercek', get: (r) => r.loadedReal },
  ]));
  const tileDrift = game.world.nations.filter((n) => n.alive)
    .filter((n) => (fresh.world.nations[n.id]?.tiles ?? 0) !== owned(fresh.world, n.id));
  if (tileDrift.length) {
    finding('HIGH', 'nation.tiles kayit/yuklemede bozuluyor',
      'toprak sayaci yuklemeden sonra gercek toprakla ayni olmali',
      `${tileDrift.length} ulkenin sayaci gercek toprakla uyusmuyor;`
      + ` ornek ulke ${tileDrift[0].id}: sayac ${fresh.world.nations[tileDrift[0].id].tiles},`
      + ` gercek ${owned(fresh.world, tileDrift[0].id)}`,
      'nation.tiles NATION_FIELDS listesinde yok ve deserialize sonrasi yeniden'
      + ' sayilmiyor; generateNations\'in verdigi 1. tur degeri kaliyor.'
      + ' YZ ordu hedefi (desiredArmy = 4 + tiles/12), sehir hedefi (tiles/45),'
      + ' tileInfamy ve hegemonya puani bu sayaci okur.');
  }

  const loadedFp = fingerprint(fresh);
  const drift = diffFingerprints(atSave, loadedFp);
  console.log(`\n  kaydetme aninin parmak izi ile yukleme aninin farki: ${drift.length ? drift.join(', ') : 'YOK'}`);
  for (const key of drift) {
    console.log(`    ${key}: kayit ${JSON.stringify(atSave[key]).slice(0, 120)}`);
    console.log(`    ${' '.repeat(key.length)}  yukleme ${JSON.stringify(loadedFp[key]).slice(0, 120)}`);
  }
  if (drift.length) {
    finding('HIGH', 'Yukleme kaydedilen durumu birebir geri getirmiyor',
      'yuklenen dunya, kaydedilen dunyayla ayni olmali',
      `farkli alanlar: ${drift.join(', ')}`,
      'kayitta saklanmayan turetilmis durum (muharebeler, cephe, budget, workedBy)'
      + ' ve yeniden uretilen birim kimlikleri');
  }
}

// 2) Yuklemenin kendi determinizmi
sub('2. Ayni kayittan iki bagimsiz yukleme + 100 hafta');
{
  const a = worker(100);
  const b = worker(100);
  const drift = diffFingerprints(a.after, b.after);
  console.log(`  iki bagimsiz yukleme farki: ${drift.length ? drift.join(', ') : 'YOK'}`);
  if (drift.length) {
    finding('HIGH', 'Yukleme deterministik degil',
      'ayni kayittan iki yukleme ayni sonucu vermeli', `farkli alanlar: ${drift.join(', ')}`, '');
  } else {
    console.log('  OK  yukleme kendi icinde deterministik (ayni surec baslangici, ayni sonuc).');
  }

}

// 3) Kaydetmeden devam vs kaydedip devam
sub('3. Kaydetmeden 100 hafta devam vs kaydedip yukleyip 100 hafta devam');
{
  const reloaded = worker(100);
  const drift = diffFingerprints(continued, reloaded.after);
  const rows = Object.keys(continued).map((key) => ({
    key,
    same: JSON.stringify(continued[key]) === JSON.stringify(reloaded.after[key]),
    a: JSON.stringify(continued[key]).slice(0, 46),
    b: JSON.stringify(reloaded.after[key]).slice(0, 46),
  }));
  console.log(table(rows, [
    { label: 'alan', get: (r) => r.key, right: false },
    { label: 'ayni', get: (r) => (r.same ? 'evet' : 'HAYIR') },
    { label: 'kesintisiz', get: (r) => r.a, right: false },
    { label: 'yuklenmis', get: (r) => r.b, right: false },
  ]));
  console.log(`\n  farkli alanlar: ${drift.length ? drift.join(', ') : 'YOK'}`);
  if (drift.length) {
    finding('HIGH', 'Kaydet-yukle simulasyonu dallandiriyor',
      'deterministik girdilerle kesintisiz kosu ile yuklenmis kosu ayni gelecegi vermeli',
      `100 hafta sonra ${drift.length} alan farkli: ${drift.join(', ')}`,
      'deserialize birimleri YENIDEN URETIR ve kimlikler surec sayacindan gelir;'
      + ' command.js `(turn + unit.id) % cadence` ile hangi tumenin o hafta taarruz'
      + ' edecegine karar verdigi icin yuklenen oyunun cephe temposu degisir.'
      + ' Ayrica aktif muharebeler kayitta bilerek dusuruluyor.');
  } else {
    console.log('  OK  kayit/yukleme gelecegi degistirmiyor.');
  }
}

// 4) KAYDA HIC GIRMEYEN ALAN. 1. bolum kayit -> yukle -> kayit turunu karsilastirir;
// hic yazilmayan bir alan iki kayitta da yoktur ve gorunmez. 2026-10-12'de
// karar bekleme sureleri (nation.decisions) boyle kaciyordu: yuklenen oyunda
// bekleyen karar hemen yeniden alinabiliyor, 1900 dunyasinda kaydet-yukle
// ucuncu haftada dallaniyordu. Bu bolum canli dunyayi yuklenen dunyayla derin
// karsilastirir; turetilen ve tani alanlari asagida adlariyla istisnadir.
sub('4. Canli <-> yuklenen durum: kayda hic girmeyen alanlar');
{
  // Turetilen (ilk haftalik isleyiste yeniden kurulur) ya da yalniz tani/duyuru.
  const DERIVED = [
    /^nations\[\]\.generals\[\]\.front/, // sinirdan turetilir (command.js)
    /^world\.contacts$/, /^world\.techHolders$/, // tur basinda yeniden hesaplanir
    /^world\.(commandWorst|storyState|pockets|surrenders)$/, // tani ve duyuru
    /^turns\.(phase|lastProfile)$/, // tani
    /^units\[\]\.lastRetreat$/, // yalniz yazilir, okuyan yok
    /^nations\[\]\.regimentsKilled$/, // oyuncu duyurusunun haftalik sayaci (events.js sifirlar)
    // Donanma: haftalik ve tohumdan turetilir (navy.js, seaZones.js). Alt
    // alanlar da (abluka dizisi ayni hafta el degistiren kiyida bayatlar ama
    // ekonomiden once her hafta yeniden kurulur; okunmadan tazelenir).
    /^world\.(navyState|seaZones)([.[]|$)/,
    // Faz 3 tarih kaydedicisinin GEÇİCİ saplaması (chronicle.js sonu): kaydı
    // gerçek kaydedici yapar; saplama bilerek kaydetmez (birleşmede değişir).
    /^world\.history([.[]|$)/,
  ];
  // Tembel kurulan kayitlar: bir tarafta hic yok, obur tarafta bos varsayilan.
  const LAZY = [/^nations\[\]\.(delegation|training)$/];
  // undefined <-> null / 0 / [] / false: okuyucular hepsini bos sayar.
  const empty = (v) => v == null || v === 0 || v === false
    || (Array.isArray(v) && v.length === 0)
    || (v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0);
  // Kendi kayit noktasi: 100. haftada kararlarin ve uzun omurlu sayaclarin
  // cogu henuz bos (karar bekleme suresi 100. haftada hic yoktu, 160'ta var).
  const live = headless(SEED);
  run(live, 160);
  const fresh = headless(SEED);
  deserialize(fresh, JSON.parse(JSON.stringify(serialize(live))));
  const seen = new WeakSet();
  const missing = new Map();
  const note = (path, a, b) => {
    const key = path.replace(/\.\d+(?=\.|$)/g, '[]');
    if (DERIVED.some((re) => re.test(key))) return;
    if ((a === undefined || b === undefined) && LAZY.some((re) => re.test(key))) return;
    if (!missing.has(key)) missing.set(key, { n: 0, example: `${path}: ${JSON.stringify(a)?.slice(0, 60)} -> ${JSON.stringify(b)?.slice(0, 60)}` });
    missing.get(key).n++;
  };
  const walk = (a, b, path, depth = 0) => {
    if (depth > 7 || typeof a === 'function' || typeof b === 'function') return;
    if (typeof a === 'number' && typeof b === 'number') {
      if (Math.abs(a - b) > 1e-9 * Math.max(1, Math.abs(a))) note(path, a, b);
      return;
    }
    if (a === b || (empty(a) && empty(b))) return;
    if (a == null || b == null || typeof a !== 'object' || typeof b !== 'object') { note(path, a, b); return; }
    if (seen.has(a)) return;
    seen.add(a);
    if (a.terrain && a.q !== undefined) { if (a.q !== b.q || a.r !== b.r) note(path, `${a.q},${a.r}`, `${b.q},${b.r}`); return; }
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) walk(a[k], b[k], `${path}.${k}`, depth + 1);
  };
  live.world.nations.forEach((n, i) => walk(n, fresh.world.nations[i], `nations.${i}`));
  for (const key of Object.keys(live.world)) {
    if (['nations', 'tiles', 'provinces', 'units', 'cities'].includes(key)) continue;
    walk(live.world[key], fresh.world[key], `world.${key}`);
  }
  (live.world.provinces ?? []).forEach((p, i) => walk(p, fresh.world.provinces[i], `provinces.${i}`));
  const flat = (units) => units.map((u) => ({ ...u, tile: [u.tile.q, u.tile.r] }));
  walk(flat(live.world.units), flat(fresh.world.units), 'units');
  for (const key of Object.keys(live.turns)) {
    if (!['game', 'world', 'log'].includes(key)) walk(live.turns[key], fresh.turns[key], `turns.${key}`);
  }
  if (!missing.size) console.log('  OK  canli durumun her alani kayittan geri geliyor.');
  for (const [key, { n, example }] of missing) {
    console.log(`  - ${key} (${n}) ${example}`);
    finding('HIGH', 'Kayda girmeyen alan', 'canli durumun her alani yuklemede geri gelmeli', `${key}: ${example}`);
  }
}

// 5) DİPLOMASİ: aktif sözler ve masa kayıtlarıyla kaydet → yükle → 104 hafta.
sub('5. Diplomasi: acik cagri, teklif, talep, elci, paktlar, garanti, gerekce, vassal, baris teklifi');
{
  const game = headless(DIP_SEED);
  const after = passivePlayer(game);
  const player = after.player;
  const world = game.world;
  const P = player.id;
  for (let i = 0; i < 60; i++) { game.turns.endTurn(); passiveWeek(game, player); }
  const T = () => game.turns.turn;
  player.power = 300;
  const contacts = world.contacts;
  const free = (n) => n.alive && n.id !== P && !hostile(world, n.id, P);
  const neighbours = world.nations.filter((n) => free(n) && contacts[P]?.[n.id]).map((n) => n.id);
  const others = world.nations.filter((n) => free(n) && !contacts[P]?.[n.id]).map((n) => n.id);
  const pick = () => neighbours.shift() ?? others.shift();
  const staged = {};
  // Bekleyen YZ barış teklifi (§10.5, game.peaceOffers): bir YZ oyuncuya savaş
  // açar; ültimatom dolunca kayıttan hemen önce beyaz barış teklifi masaya düşer.
  const foe = [...others].reverse().concat([...neighbours].reverse()).find((id) => {
    world.nations[id].power = Math.max(world.nations[id].power ?? 0, 80);
    return !warBlockers(world, id, P, T()).length;
  });
  if (foe != null) {
    for (const list of [neighbours, others]) if (list.includes(foe)) list.splice(list.indexOf(foe), 1);
    staged.war = declareWar(game, foe, P, {});
    for (let i = 0; i < 12 && staged.war && !atWar(world, foe, P); i++) { game.turns.endTurn(); passiveWeek(game, player); }
    player.power = 300;
  }
  // İttifak + açık çağrı (müttefike bir YZ saldırır; çağrı bir hafta sonra masada).
  const ally = pick();
  formAlliance(world, P, ally, T());
  const aggressor = world.nations.find((n) => n.alive && n.id !== P && n.id !== ally && contacts[n.id]?.[ally]
    && !warBlockers(world, n.id, ally, T()).length && (n.power = Math.max(n.power ?? 0, 80)) && true)?.id;
  staged.call = aggressor != null && declareWar(game, aggressor, ally, {});
  game.turns.endTurn(); passiveWeek(game, player);
  // İttifak teklifi, iki elçi, paktlar, garanti, gerekçe, vassal.
  const proposer = pick();
  pushProposal(world, { treaty: 'ALLIANCE', from: proposer, to: P }, T());
  const e1 = pick();
  const e2 = pick();
  staged.envoys = [postEnvoy(world, player, e1), postEnvoy(world, player, e2)];
  const napA = pick();
  signNap(game, player, world.nations[napA]);
  for (const id of [P, napA]) {
    const t = world.nations[id].treaties.find((x) => x.type === 'NAP');
    if (t) t.until = T() + 10;
  }
  const [g1, g2] = [others.shift(), others.shift()];
  if (g1 != null && g2 != null) { signNap(game, world.nations[g1], world.nations[g2]); denounceNap(game, world.nations[g1], g2); }
  const protege = pick();
  if (protege != null) (player.treaties ??= []).push({ type: 'GUARANTEE', partner: protege, since: T() });
  const cbTarget = pick();
  const cbProvince = world.provinces.find((p) => p.owner === cbTarget && p.econ);
  if (cbProvince) player.treaties.push({ type: 'CB', partner: cbTarget, since: T(), expires: T() + 40, province: cbProvince.id });
  const vassal = pick();
  if (vassal != null) {
    const v = world.nations[vassal];
    v.treaties = (v.treaties ?? []).filter((t) => t.type !== 'ALLIANCE');
    v.treaties.push({ type: 'VASSALIZE', partner: P, since: T() - 120, autonomy: 48 });
  }
  // Bize talep: bir komşunun bitişik province'imize iddiası.
  for (const id of world.nations.filter((n) => free(n) && contacts[P]?.[n.id]).map((n) => n.id)) {
    const x = world.nations[id];
    const near = new Set();
    for (const p of world.provinces) if (p.owner === id) for (const nb of p.neighbors ?? []) near.add(nb);
    const prov = world.provinces.find((p) => p.owner === P && p.econ && p.center && near.has(p.id)
      && p.id !== player.capital?.provinceId);
    if (!prov) continue;
    x.claims = [...(x.claims ?? []), prov.id];
    x.power = Math.max(x.power ?? 0, 60);
    if (issueDemand(game, x, P, prov.id) === 'pending') { staged.demand = id; break; }
  }
  if (foe != null && atWar(world, foe, P)) {
    staged.peaceOffer = Boolean(game.receivePeaceOffer(foe, P, { demands: [], concessions: [], terms: [] }));
  }
  staged.pending = (world.diplo?.pending ?? []).map((r) => `${r.kind}${r.treaty ? `:${r.treaty}` : ''}`);
  console.log(`  kurulum: ${JSON.stringify(staged)}`);
  writeFileSync(DIP_FILE, JSON.stringify(serialize(game)));
  const atSaveDiplo = diploSnapshot(game);
  for (let i = 0; i < 104; i++) { game.turns.endTurn(); passiveWeek(game, player); }
  const contFp = fingerprint(game);
  const contDiplo = diploSnapshot(game);
  const loaded = JSON.parse(execFileSync(process.execPath, [fileURLToPath(import.meta.url), '--dip-worker'],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }));
  if (loaded.error) {
    finding('CRITICAL', 'Diplomasi kaydi yuklenmiyor', 'kayit yuklenmeli', loaded.error);
  } else {
    const atLoad = loaded.loaded === atSaveDiplo;
    const drift = diffFingerprints(contFp, loaded.after);
    const diploSame = loaded.diplo === contDiplo;
    console.log(`  yuklemede masa/defter/anlasmalar ayni: ${atLoad ? 'evet' : 'HAYIR'}`);
    console.log(`  104 hafta sonra parmak izi farki: ${drift.length ? drift.join(', ') : 'YOK'} · diplomasi: ${diploSame ? 'ayni' : 'FARKLI'}`);
    if (!atLoad) finding('HIGH', 'Diplomasi kayda tam girmiyor', 'yuklenen masa/defter kayittakiyle ayni', 'farkli');
    if (drift.length || !diploSame) {
      finding('HIGH', 'Diplomasi kaydet-yukle dallaniyor', 'kesintisiz ve yuklenmis kosu ayni',
        `${drift.join(', ') || '-'}${diploSame ? '' : ' + diplomasi durumu'}`);
    } else {
      console.log('  OK  aktif sozler ve bekleyen kayitlar kaydet-yukle sonrasi ayni gelecegi veriyor.');
    }
  }
}

process.exit(reportFindings() > 0 ? 1 : 0);
