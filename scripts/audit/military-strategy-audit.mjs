// Stratejik askeri YZ enstrumantasyonu.
//
// Gelistiricinin gozlemleri HIPOTEZ olarak ele alinir ve olculur:
//   H1 bazi cepheler bos kaliyor
//   H2 ordular stratejik olarak absurt yerlerde oturuyor
//   H3 kara birlikleri suda takiliyor
//   H4 cephe tahsisi dogru calismiyor
//   H5 bazi ulkeler ihtiyacini karsilamayacak kadar az kuvvetle basliyor
//
// Bos cephe icin SEBEP KODU uretir: kuvvet yok / yolda / dusuk oncelik /
// ulasilamaz / atama hatasi. YZ sebebini soyleyemiyorsa arastirilir.

import {
  headless, alive, n0, n1, n2, pct, section, sub, table, finding, reportFindings,
} from './harness.mjs';
import { atWar } from '../../src/game/diplomacy.js';
import { controllerOf } from '../../src/game/control.js';
import {
  generalsOf, branchOf, postTileOf, borderNationIds, BRANCH,
} from '../../src/game/command.js';
import { armyPower, regimentCount, soldiersOf, isMoving } from '../../src/game/units.js';
import { destinationOf } from '../../src/game/movement.js';
import { findPath } from '../../src/core/pathfind.js';

const WEEKS = Number(process.argv[2] ?? 400);

section('STRATEJIK ASKERI YZ ENSTRUMANTASYONU');

const game = headless('MILSTRAT');
const world = game.world;

// Suda kalan kara birliginin OMRU: id -> kac hafta suda ve emirsiz.
const strandedAge = new Map();
let strandedPeak = 0;
let strandedEver = 0;
// Atil ordu omru: id -> kac hafta mevkisiz/emirsiz, ulke savasta iken.
const idleAge = new Map();
let idlePeak = 0;

const history = [];
// Cephe ornekleri savas SURERKEN toplanir. Kosu sonundaki tek kare yetmiyor:
// tohuma gore 400. haftada hic savas kalmayabiliyor ve olcum bos donuyor.
const sampledFronts = [];

/** Bir haftalik cephe kesiti; bos/zayif cephe icin sebep kodu uretir. */
function collectFronts() {
  for (const nation of world.nations) {
    if (!nation.alive) continue;
    const atWarNow = world.nations.some(
      (o) => o.alive && o.id !== nation.id && atWar(world, nation.id, o.id),
    );
    if (!atWarNow) continue;

    const landUnits = world.units.filter(
      (u) => u.nationId === nation.id && u.type.domain === 'land' && u.hp > 0,
    );
    const assigned = new Set();
    for (const g of generalsOf(nation)) for (const id of g.divisions) assigned.add(id);

    for (const general of generalsOf(nation)) {
      if (branchOf(general) !== BRANCH.ARMY) continue;
      const front = general.front ?? [];
      if (!front.length) continue;
      const divisions = landUnits.filter((u) => general.divisions.includes(u.id));
      const active = divisions.filter((u) => !u.embarked);
      const onPost = active.filter((u) => {
        const p = postTileOf(world, u);
        return p && u.tile === p;
      });
      const marching = active.filter((u) => isMoving(u));

      let reason;
      if (active.length === 0) {
        if (divisions.length > 0) reason = 'HEPSI EMBARKED';
        else if (landUnits.length === 0) reason = 'KUVVET YOK (ulkede)';
        else if (landUnits.every((u) => assigned.has(u.id))) reason = 'KUVVET BASKA GRUPTA';
        else reason = 'ATAMA HATASI (bosta tumen var)';
      } else if (marching.length === active.length) reason = 'KUVVET YOLDA';
      else if (onPost.length < active.length) reason = 'KISMI YERLESIK';
      else reason = 'YERLESIK';

      sampledFronts.push({
        week: world.turn,
        nation: nation.name,
        front: front.length,
        divisions: divisions.length,
        active: active.length,
        onPost: onPost.length,
        marching: marching.length,
        coverage: onPost.length / front.length,
        power: active.reduce((s, u) => s + armyPower(u), 0),
        reason,
      });
    }
  }
}

for (let w = 0; w < WEEKS; w++) {
  game.turns.endTurn();
  // Her 13 haftada bir ornek: iz butun kosuyu kapsar, cikti sisirmez.
  if (w % 13 === 0) collectFronts();

  // --- suda takilan kara birlikleri ---
  for (const unit of world.units) {
    if (unit.type.domain !== 'land') continue;
    const onWater = !!unit.tile?.terrain?.water;
    const orphan = onWater && !isMoving(unit) && !unit.battleId;
    if (orphan) {
      const age = (strandedAge.get(unit.id) ?? 0) + 1;
      strandedAge.set(unit.id, age);
      if (age === 1) strandedEver++;
      strandedPeak = Math.max(strandedPeak, age);
    } else {
      strandedAge.delete(unit.id);
    }
  }

  // --- atil ordular (ulke savasta, mevki yok, emir yok) ---
  for (const nation of world.nations) {
    if (!nation.alive) continue;
    const warring = world.nations.some(
      (o) => o.alive && o.id !== nation.id && atWar(world, nation.id, o.id),
    );
    if (!warring) continue;
    for (const unit of world.units) {
      if (unit.nationId !== nation.id || unit.type.domain !== 'land') continue;
      if (unit.embarked || unit.battleId) continue;
      const post = postTileOf(world, unit);
      const idle = !post && !isMoving(unit);
      if (idle) {
        const age = (idleAge.get(unit.id) ?? 0) + 1;
        idleAge.set(unit.id, age);
        idlePeak = Math.max(idlePeak, age);
      } else idleAge.delete(unit.id);
    }
  }

  if (w % 50 === 0 || w === WEEKS - 1) {
    history.push({
      week: w, year: 1836 + Math.floor(w / 52),
      stranded: [...strandedAge.values()].filter((a) => a >= 4).length,
      idle: [...idleAge.values()].filter((a) => a >= 8).length,
      wars: countWars(),
    });
  }
}

function countWars() {
  let n = 0;
  for (let a = 0; a < world.nations.length; a++) {
    for (let b = a + 1; b < world.nations.length; b++) {
      if (world.nations[a].alive && world.nations[b].alive && atWar(world, a, b)) n++;
    }
  }
  return n;
}

sub('ZAMAN IZI');
console.log(table(history, [
  { label: 'yil', get: (r) => r.year },
  { label: 'savas', get: (r) => r.wars },
  { label: 'suda takili (>=4hf)', get: (r) => r.stranded },
  { label: 'atil (>=8hf)', get: (r) => r.idle },
]));

// ---------------------------------------------------- H3 SUDA TAKILANLAR ---
sub('H3 — KARA BIRLIGI SUDA');
const strandedNow = [...strandedAge.entries()].filter(([, a]) => a >= 4);
console.log(`  Su an suda ve emirsiz (>=4 hafta): ${strandedNow.length}`);
console.log(`  Kosu boyunca en uzun kalis: ${strandedPeak} hafta · toplam vaka: ${strandedEver}`);
if (strandedNow.length) {
  const rows = strandedNow.slice(0, 8).map(([id, age]) => {
    const unit = world.units.find((u) => u.id === id);
    return {
      id, age,
      nation: world.nations[unit?.nationId]?.name ?? '?',
      at: unit ? `${unit.tile.q},${unit.tile.r}` : '?',
      embarked: unit?.embarked ? 'evet' : 'HAYIR',
      general: unit ? (generalsOf(world.nations[unit.nationId])
        .some((g) => g.divisions.includes(id)) ? 'var' : 'yok') : '?',
    };
  });
  console.log(table(rows, [
    { label: 'birim', get: (r) => r.id },
    { label: 'ulke', get: (r) => r.nation, right: false },
    { label: 'kare', get: (r) => r.at },
    { label: 'hafta', get: (r) => r.age },
    { label: 'embarked', get: (r) => r.embarked },
    { label: 'general', get: (r) => r.general },
  ]));
}
if (strandedPeak >= 12) {
  finding('HIGH', 'kara birligi suda yetim kaliyor',
    'kara birligi kalici olarak okyanusta kalmamali',
    `en uzun ${strandedPeak} hafta, ${strandedEver} vaka`,
    'runGroup embarked birimi divisions listesine almiyor (command.js): '
    + 'mevki yok, march yok, advance yok -> yol bir kez silinince kimse toplamaz');
}

// -------------------------------------------------------- H2 ATIL ORDULAR ---
sub('H2 — ATIL ORDU (ulke savasta)');
const idleNow = [...idleAge.entries()].filter(([, a]) => a >= 8);
console.log(`  Savas suren ulkelerde >=8 hafta mevkisiz/emirsiz tumen: ${idleNow.length}`);
console.log(`  En uzun atil kalis: ${idlePeak} hafta`);
if (idlePeak >= 26) {
  finding('HIGH', 'atil ordu',
    'savas surerken kullanilabilir tumen aylarca bos oturmamali',
    `en uzun ${idlePeak} hafta atil`,
    `${idleNow.length} tumen su an >=8 haftadir mevkisiz`);
}

// ------------------------------------------- H1 + H4 CEPHE DOLULUK / SEBEP ---
sub('H1 + H4 — CEPHE DOLULUGU VE BOS CEPHE SEBEBI');

const frontRows = sampledFronts;
console.log(`  Savas suren haftalardan toplanan cephe ornegi: ${frontRows.length}`);
frontRows.sort((a, b) => a.coverage - b.coverage);
console.log(table(frontRows.slice(0, 16), [
  { label: 'ulke', get: (r) => r.nation, right: false },
  { label: 'cephe', get: (r) => r.front },
  { label: 'tumen', get: (r) => r.divisions },
  { label: 'aktif', get: (r) => r.active },
  { label: 'mevkide', get: (r) => r.onPost },
  { label: 'yolda', get: (r) => r.marching },
  { label: 'doluluk', get: (r) => pct(r.coverage) },
  { label: 'sebep', get: (r) => r.reason, right: false },
]));

// Ozet dagilim: en kotu 16 satir yaniltici. Asil soru cephenin GENELDE
// tutulup tutulmadigi.
const covs = frontRows.map((r) => r.coverage).sort((a, b) => a - b);
const manned = frontRows.filter((r) => r.active > 0);
const settledRatio = manned.length
  ? manned.reduce((s, r) => s + r.onPost / Math.max(1, r.active), 0) / manned.length : 0;
if (covs.length) {
  console.log(`\n  Doluluk (mevkide/cephe): medyan ${pct(covs[Math.floor(covs.length / 2)])}`
    + ` · ort ${pct(covs.reduce((s, v) => s + v, 0) / covs.length)}`
    + ` · %0 olan ${covs.filter((v) => v === 0).length}/${covs.length}`);
  console.log(`  Tumeni olan gruplarda mevkisine YERLESMIS tumen orani: ${pct(settledRatio)}`);
}
const reasonTally = frontRows.reduce((acc, r) => {
  acc[r.reason] = (acc[r.reason] ?? 0) + 1; return acc;
}, {});
console.log('  Sebep dagilimi: ' + Object.entries(reasonTally)
  .map(([k, v]) => `${k}=${v}`).join(' · '));

const empty = frontRows.filter((r) => r.front > 0 && r.active === 0);
const bug = empty.filter((r) => r.reason === 'ATAMA HATASI (bosta tumen var)');
console.log(`\n  Cephesi olup aktif tumeni olmayan grup: ${empty.length}/${frontRows.length}`);
for (const [reason, count] of Object.entries(
  empty.reduce((acc, r) => { acc[r.reason] = (acc[r.reason] ?? 0) + 1; return acc; }, {}),
)) console.log(`    ${reason}: ${count}`);

if (bug.length) {
  finding('HIGH', 'cephe atama hatasi',
    'bosta tumen varken cephe bos kalmamali',
    `${bug.length} grupta cephe bos ve ulkede atanmamis tumen var`);
}

// -------------------------------------------------- H5 BASLANGIC KUVVETI ---
sub('H5 — KUVVET / CEPHE ORANI');
const ratios = [];
for (const nation of alive(game)) {
  const foes = world.nations.filter(
    (o) => o.alive && o.id !== nation.id && atWar(world, nation.id, o.id),
  );
  const land = world.units.filter(
    (u) => u.nationId === nation.id && u.type.domain === 'land' && u.hp > 0,
  );
  let frontLen = 0;
  for (const g of generalsOf(nation)) {
    if (branchOf(g) === BRANCH.ARMY) frontLen = Math.max(frontLen, (g.front ?? []).length);
  }
  ratios.push({
    name: nation.name,
    atWar: foes.length,
    divisions: land.length,
    regiments: land.reduce((s, u) => s + regimentCount(u), 0),
    soldiers: land.reduce((s, u) => s + soldiersOf(u), 0),
    front: frontLen,
    perTile: frontLen > 0 ? land.length / frontLen : Infinity,
    borders: borderNationIds(world, nation.id).length,
  });
}
const warring = ratios.filter((r) => r.atWar > 0).sort((a, b) => a.perTile - b.perTile);
console.log('  Savasta olan ulkeler, tumen/cephe-karesi en dusukten:');
console.log(table(warring.slice(0, 12), [
  { label: 'ulke', get: (r) => r.name, right: false },
  { label: 'savas', get: (r) => r.atWar },
  { label: 'tumen', get: (r) => r.divisions },
  { label: 'asker', get: (r) => n0(r.soldiers) },
  { label: 'cephe', get: (r) => r.front },
  { label: 'tumen/kare', get: (r) => n2(r.perTile) },
]));
const thin = warring.filter((r) => r.front > 0 && r.perTile < 0.2);
if (thin.length >= Math.max(2, warring.length * 0.4)) {
  finding('MEDIUM', 'cephe kuvvet yogunlugu',
    'savasan ulke cephesini anlamli yogunlukla tutabilmeli',
    `${thin.length}/${warring.length} ulkede cephe karesi basina <0.2 tumen`,
    'cephe uzunlugu kuvvetten cok daha hizli buyuyor');
}

// --------------------------------------------- ULASILAMAZ EMIR TARAMASI ---
sub('ULASILAMAZ HEDEF');
let unreachable = 0;
const unreachableRows = [];
for (const unit of world.units) {
  if (unit.type.domain !== 'land' || !isMoving(unit)) continue;
  const dest = destinationOf(unit);
  if (!dest) continue;
  const path = findPath(world, unit.tile, dest, {
    canEnter: game.canEnterFor(unit),
    costOf: game.costForUnit(unit),
  });
  if (!path?.length) {
    unreachable++;
    if (unreachableRows.length < 6) {
      unreachableRows.push({
        id: unit.id, nation: world.nations[unit.nationId]?.name ?? '?',
        from: `${unit.tile.q},${unit.tile.r}`, to: `${dest.q},${dest.r}`,
        water: unit.tile.terrain.water ? 'evet' : 'hayir',
      });
    }
  }
}
console.log(`  Yolu olup hedefine ulasamayan kara birligi: ${unreachable}`);
if (unreachableRows.length) {
  console.log(table(unreachableRows, [
    { label: 'birim', get: (r) => r.id },
    { label: 'ulke', get: (r) => r.nation, right: false },
    { label: 'konum', get: (r) => r.from },
    { label: 'hedef', get: (r) => r.to },
    { label: 'suda', get: (r) => r.water },
  ]));
}
if (unreachable > 0) {
  finding('MEDIUM', 'ulasilamaz emir',
    'hedefine yolu olmayan birim emri dusurup yeniden gorevlendirilmeli',
    `${unreachable} birim ulasilamaz hedefe yurumeye calisiyor`);
}

process.exit(reportFindings() > 0 ? 1 : 0);
