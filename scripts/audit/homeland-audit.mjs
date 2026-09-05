// ANA YURT DENETIMI — kirik kume mekanigi calisiyor mu?
//
// Neyi sabitler: fetih kartopu bulgusunun (audit:borders / audit:war-pressure)
// kaynagi savas degil, bir DONGUYDU. Mirascisi olmayan ayaklanma kumeyi
// sahipsiz birakiyor, sahipsiz toprak savassiz ve sohretsiz yerlesiliyor,
// ayni kume iki yilda bir yeniden kopuyordu. Olculdu (50 yil x 3 tohum):
// sahiplik olaylarinin %78'i bu donguydu ve bir kume 24 kez el degistirdi.
//
// Ayni dongu dunyayi da temizliyordu: yabanci halk payi %41,3 -> %6,0.
// Yani fethin kalici bedeli yoktu ve kultur freni, oyuncunun EN COK
// fethettigi cagda tutunacak hicbir sey bulamiyordu.
//
// Bu denetim yeni mekanigin ALTI iddiasini ayri ayri olcer. Hicbir esik
// burada uydurulmaz: ya kosunun kendi taban kolundan cikar, ya da acikca
// "tasarim karari" diye yazilir.

import {
  headless, run, section, sub, table, n1, n2, pct, finding, reportFindings,
} from './harness.mjs';
import {
  CULTURE, brokenByCulture, brokenProvinces, expelCulture, foreignShareOf,
  releaseToKin, acceptCulture, acceptBlockers, cultureMix,
} from '../../src/game/culture.js';
import { provinceOutput } from '../../src/game/provinces.js';
import { TurnManager } from '../../src/game/turn.js';

const YEARS = Number(process.argv[2] ?? 50);
const SEEDS = (process.argv[3] ?? 'HL1,HL2,HL3').split(',');

section(`ANA YURT DENETIMI — ${YEARS} yil x ${SEEDS.length} tohum`);

// Sahiplik degisiminin SEBEBINI sayabilmek icin devir yollari sarilir.
const cause = { peace: 0, war: 0, free: 0 };
const claimBase = TurnManager.prototype.claim;
const peaceBase = TurnManager.prototype.claimAtPeace;
TurnManager.prototype.claim = function counted(tile, nationId) {
  const province = this.world.provinces?.[tile?.provinceId];
  const before = province?.owner ?? -2;
  const done = claimBase.call(this, tile, nationId);
  if (done && province && province.owner !== before) cause[before < 0 ? 'free' : 'war']++;
  return done;
};
TurnManager.prototype.claimAtPeace = function counted(tile, nationId) {
  const province = this.world.provinces?.[tile?.provinceId];
  const before = province?.owner ?? -2;
  const done = peaceBase.call(this, tile, nationId);
  if (done && province && province.owner !== before) cause.peace++;
  return done;
};

function runSeed(seed) {
  cause.peace = 0; cause.war = 0; cause.free = 0;
  const game = headless(seed);
  const world = game.world;
  const startOwner = world.provinces.map((p) => p.owner);
  const nationsBefore = world.nations.filter((n) => n.alive).length;
  run(game, YEARS * 52);

  const changed = world.provinces.filter((p, i) => p.owner !== startOwner[i]).length;
  let foreignWeighted = 0;
  let people = 0;
  let broken = 0;
  let brokenOutput = 0;
  let healthyOutput = 0;
  let healthy = 0;
  let wallCount = 0;      // uc kapisi da kapali kirik halk
  let brokenGroups = 0;
  for (const province of world.provinces) {
    if (province.owner < 0 || !province.econ) continue;
    const nation = world.nations[province.owner];
    if (!nation?.alive) continue;
    const pop = Math.max(0, province.econ.population ?? 0);
    people += pop;
    foreignWeighted += foreignShareOf(province, nation) * pop;
    const out = provinceOutput(world, province);
    const total = Object.values(out).reduce((sum, v) => sum + v, 0);
    if (province.econ.brokenSince != null) {
      broken++;
      brokenOutput += total / Math.max(1, province.econ.hexes ?? 1);
    } else {
      healthy++;
      healthyOutput += total / Math.max(1, province.econ.hexes ?? 1);
    }
  }
  for (const nation of world.nations) {
    if (!nation.alive) continue;
    for (const group of brokenByCulture(world, nation)) {
      brokenGroups++;
      if (group.accept.length && group.release.length && group.expel.length) wallCount++;
    }
  }
  return {
    seed,
    provinces: world.provinces.length,
    changed,
    share: changed / world.provinces.length,
    nationsBefore,
    nationsAfter: world.nations.filter((n) => n.alive).length,
    foreign: people > 0 ? foreignWeighted / people : 0,
    revolts: world.cultureRevolts ?? 0,
    suppressed: world.suppressedRevolts ?? 0,
    releases: world.cultureReleases ?? 0,
    expulsions: world.cultureExpulsions ?? 0,
    broken,
    brokenGroups,
    wallCount,
    brokenOutput: broken > 0 ? brokenOutput / broken : 0,
    healthyOutput: healthy > 0 ? healthyOutput / healthy : 0,
    peace: cause.peace,
    free: cause.free,
    war: cause.war,
  };
}

const rows = SEEDS.map(runSeed);
const avg = (key) => rows.reduce((sum, r) => sum + r[key], 0) / rows.length;

sub('KOSU SONUCLARI');
console.log(table(rows, [
  { label: 'tohum', get: (r) => r.seed, right: false },
  { label: 'kume', get: (r) => r.provinces },
  { label: 'el degisen', get: (r) => `${r.changed} (${pct(r.share)})` },
  { label: 'baris masasi', get: (r) => r.peace },
  { label: 'bedava yerlesme', get: (r) => r.free },
  { label: 'isyan', get: (r) => r.revolts },
  { label: 'bastirilan', get: (r) => r.suppressed },
  { label: 'birakilan', get: (r) => r.releases },
  { label: 'surgun', get: (r) => r.expulsions },
  { label: 'kirik kume', get: (r) => r.broken },
  { label: 'yabanci pay', get: (r) => pct(r.foreign) },
  { label: 'ulke', get: (r) => `${r.nationsBefore}->${r.nationsAfter}` },
]));

// --- TEST 1: bastirilan ayaklanma toprak devretmiyor mu? ---
sub('TEST 1 — bastirilan ayaklanma toprak devretmiyor mu?');
{
  // Esik kosunun kendi sayimindan: bedava yerlesme, baris masasinin
  // yaninda gurultu kalmali. Onarim oncesi olculen oran 206/139 = 1,48'di.
  const oran = avg('free') / Math.max(1, avg('peace'));
  console.log(`  bedava yerlesme ${n1(avg('free'))} · baris masasi ${n1(avg('peace'))}`
    + ` · oran ${n2(oran)} (onarim oncesi 1,48)`);
  if (oran > 0.25) {
    finding('HIGH', 'sahipsiz toprak',
      'bastirilan ayaklanma toprak birakmamali: bedava yerlesme baris masasinin dortte birini gecmemeli',
      `oran ${n2(oran)}`,
      'sahipsiz kume savassiz ve sohretsiz yerlesiliyor; kartopunun kaynagi buydu');
  } else {
    console.log('  -> Ayaklanma haritayi titretmiyor. DOGRU.');
  }
}

// --- TEST 2: dunya kulturel olarak ayakta kaliyor mu? ---
sub('TEST 2 — dunya homojenlesmiyor mu? (ana yurt kilidi)');
{
  // Onarim oncesi olculdu: 1836'da %41,3 olan yabanci pay 1886'da %6,0'a
  // duşuyordu. Esik tasarim karari: yarisindan fazlasi erimemeli.
  console.log(`  ${YEARS} yil sonunda yabanci halk payi ${pct(avg('foreign'))}`
    + ' (onarim oncesi %6,0 · dunya doğusunda ~%41)');
  if (avg('foreign') < 0.10) {
    finding('HIGH', 'ana yurt',
      'bir halk kendi yurdunda erimemeli: yuzyil ortasinda yabanci pay %10 altina inmemeli',
      pct(avg('foreign')),
      'erimis dunyada kultur freni tutunacak yer bulamaz');
  } else {
    console.log('  -> Halklar yurdunda duruyor. DOGRU.');
  }
}

// --- TEST 3: kirik kume gercekten calismiyor mu? ---
sub('TEST 3 — kirik kume gercekten calismiyor mu?');
{
  const oran = avg('brokenOutput') / Math.max(1e-9, avg('healthyOutput'));
  console.log(`  hex basina cikti — kirik ${n2(avg('brokenOutput'))}`
    + ` · saglam ${n2(avg('healthyOutput'))} · oran ${pct(oran)}`);
  if (!avg('broken')) {
    console.log('  -> Kirik kume yok; bu kosuda olculemez.');
  } else if (oran > 0.35) {
    finding('MEDIUM', 'kirik kume',
      'kirik kume saglam kumenin ucte birinden fazlasini uretmemeli',
      pct(oran),
      'bedel hissedilmiyorsa mekanik bir uyaridan ibarettir');
  } else {
    console.log('  -> Kirik kume kendini odemiyor: bedel gercek. DOGRU.');
  }
}

// --- TEST 4: her kirik halkin en az bir cikisi var mi? ---
sub('TEST 4 — kirik kume duvar mi, soru mu? (cikis kapisi)');
{
  console.log(`  kirik halk ${n1(avg('brokenGroups'))} · uc kapisi da kapali ${n1(avg('wallCount'))}`);
  if (avg('wallCount') > 0) {
    finding('HIGH', 'cikis yolu',
      'her kirik halkin en az bir cikisi olmali (ortak et / birak / sur)',
      `${n1(avg('wallCount'))} halk icin uc kapi da kapali`,
      'cikissiz bedel bir secim degil, bir duvardir');
  } else {
    console.log('  -> Her kirik halkin en az bir cikisi var. DOGRU.');
  }
}

// --- TEST 5: savas hala toprak uretiyor mu? (alt sinir) ---
sub('TEST 5 — savas hala toprak uretiyor mu?');
{
  console.log(`  ${YEARS} yilda el degisen kume orani ${pct(avg('share'))}`
    + ` · bunun ${n1(avg('peace'))} olayi baris masasindan`);
  if (avg('share') < 0.03) {
    finding('CRITICAL', 'toprak uretimi',
      'savas hala sinir degistirmeli', pct(avg('share')),
      'kartopu freni savasi oldurdu: audit:borders TEST 1 ile ayni kapi');
  } else if (avg('share') > 0.33) {
    finding('HIGH', 'kartopu',
      'haritanin ucte birinden fazlasi el degistirmemeli', pct(avg('share')),
      'audit:borders TEST 3 ile ayni esik');
  } else {
    console.log('  -> Savas toprak uretiyor, harita dagilmiyor. DOGRU.');
  }
}

// --- TEST 6: uc cikisin her biri gercekten calisiyor mu? ---
sub('TEST 6 — uc cikis: ortak et / birak / sur');
{
  // Bir kapinin KULLANILMAMASI ile HIC ACILMAMASI ayri seylerdir. Once
  // dunyada her kapinin kac kez acik oldugu sayilir; sonra acik olanlardan
  // biri fiilen calistirilir. Bulgu ancak "acik ama isletilemedi" ise cikar.
  const game = headless(SEEDS[0]);
  const world = game.world;
  run(game, 30 * 52);
  const open = { accept: [], release: [], expel: [] };
  for (const nation of world.nations) {
    if (!nation.alive) continue;
    for (const group of brokenByCulture(world, nation)) {
      if (!group.accept.length) open.accept.push([nation, group]);
      if (!group.release.length) open.release.push([nation, group]);
      if (!group.expel.length) open.expel.push([nation, group]);
    }
    // Kabul kapisi kirik kume olmadan da acik olabilir. Kapinin acik olup
    // olmadigini PAY DEGIL, engel listesinin kendisi soyler — pay yalniz
    // engellerden biridir (residency yasasi ve suren tepki de vardir).
    for (const row of cultureMix(world, nation)) {
      if (row.primary || row.accepted) continue;
      if (!acceptBlockers(world, nation, row.id).length) open.accept.push([nation, row]);
    }
  }
  console.log(`  acik kapi sayisi — ortak et ${open.accept.length}`
    + ` · birak ${open.release.length} · sur ${open.expel.length}`);

  const worked = new Set();
  const failed = [];
  if (open.release.length) {
    const [nation, group] = open.release[0];
    const before = nation.provinces ?? 0;
    const moved = releaseToKin(game, nation, group.id);
    if (moved) {
      worked.add('birak');
      console.log(`  birak     ${nation.name} -> ${group.name}: ${moved} kume`
        + ` (${before} -> ${nation.provinces})`);
    } else failed.push('birak');
  }
  if (open.expel.length) {
    const [nation, group] = open.expel[0];
    const infamyBefore = nation.infamy ?? 0;
    const gone = expelCulture(game, nation, group.id);
    if (gone) {
      worked.add('sur');
      console.log(`  sur       ${nation.name} -> ${group.name}:`
        + ` ${Math.round(gone).toLocaleString('en-US')} kisi`
        + ` · sohret ${n1(infamyBefore)} -> ${n1(nation.infamy ?? 0)}`);
    } else failed.push('sur');
  }
  if (open.accept.length) {
    const [nation, group] = open.accept[0];
    const brokenBefore = brokenProvinces(world, nation, group.id).length;
    if (acceptCulture(game, nation, group.id)) {
      worked.add('ortak et');
      console.log(`  ortak et  ${nation.name} -> ${group.name}:`
        + ` kabul edildi · kapanan kirik kume ${brokenBefore}`);
    } else failed.push('ortak et');
  }

  const kapali = ['ortak et', 'birak', 'sur'].filter((k) => {
    const key = k === 'ortak et' ? 'accept' : k === 'birak' ? 'release' : 'expel';
    return !open[key].length;
  });
  if (failed.length) {
    finding('HIGH', 'cikis kapisi',
      'acik gorunen kapi calistirilabilmeli',
      `acik ama isletilemedi: ${failed.join(', ')}`,
      'engel listesi bos donuyor ama eylem hicbir sey yapmiyor');
  } else if (kapali.length === 3) {
    finding('MEDIUM', 'cikis kapilari',
      'kosuda en az bir cikis kapisi acik olmali',
      'ucu de kapali', '30 yillik kosuda hicbir halk icin cikis acilmadi');
  } else {
    console.log(`  -> Acilan kapilarin hepsi calisti${kapali.length
      ? ` (bu kosuda hic acilmayan: ${kapali.join(', ')})` : ''}. DOGRU.`);
  }
}

process.exit(reportFindings() > 0 ? 1 : 0);
