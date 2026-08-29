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

const SEED = 'save-audit';
const HERE = dirname(fileURLToPath(import.meta.url));
const TMP = join(HERE, '_tmp');
mkdirSync(TMP, { recursive: true });
const SAVE_FILE = join(TMP, 'save-audit.json');

/** Karsilastirilabilir, kompakt dunya parmak izi. */
function fingerprint(game) {
  const world = game.world;
  const nations = world.nations.filter((n) => n.alive).map((n) => [
    n.id,
    Number((n.gold ?? 0).toFixed(3)),
    Number((n.debt ?? 0).toFixed(3)),
    n.tiles,
    n.economy.factories.length,
    n.economy.factories.reduce((s, f) => s + f.level, 0),
    Number(n.economy.factories.reduce((s, f) => s + f.employees, 0).toFixed(2)),
    Number((n.economy.stability ?? 0).toFixed(6)),
    n.economy.taxRate, n.economy.armyFunding,
    n.economy.tariff,
    (n.construction?.projects ?? []).length,
    (n.construction?.buildings ?? []).length,
    world.units.filter((u) => u.nationId === n.id).length,
  ].join(','));
  let pop = 0;
  world.forEach((t) => { if (t.province) pop += t.province.population; });
  const prices = Object.entries(world.market.goods)
    .map(([id, g]) => `${id}=${g.price.toFixed(6)}`).join(';');
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
  };
}

function diffFingerprints(a, b) {
  const out = [];
  for (const key of Object.keys(a)) {
    if (JSON.stringify(a[key]) !== JSON.stringify(b[key])) out.push(key);
  }
  return out;
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
  // Karsilastirma DISKTEKI kayda karsi yapilir. serialize() economy/politics/
  // construction icin CANLI REFERANS dondurur; bellekteki `payload` nesnesi
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


process.exit(reportFindings() > 0 ? 1 : 0);
