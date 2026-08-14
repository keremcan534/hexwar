// Makro dunya denetimi: Vic2 tarzi kurgusal dunya hedeflerini olcer
// (bkz. docs/makro-dunya.md "Dogrulama" listesi).
//
//   1. Arketiplerin hepsi dogdu mu?
//   2. Ulke basina province bandi (2-35) tutuyor mu?
//   3. Sahipsiz pay makul mu (kolonizasyon alani acik mi)?
//   4. Yarimada kolonisi: kalabalik, cekirdek DEGIL, kulturu kabul edilmemis mi?
//   5. Ic deniz var mi (okyanusa dar agizla bagli kapali deniz)?
//   6. Yogun-batida coklu devlet, bozkirda tek dev var mi?
//   7. Kolonizasyon alani (guney-kita ici) bos mu?
//   8. Nufus asimetrisi: dogu devi ve koloni nufus agirligi tasiyor mu?

import { STANDARD_COLS, STANDARD_ROWS, generateWorld } from '../../src/world/worldgen.js';
import { generateNations } from '../../src/world/nations.js';
import { initProvinces } from '../../src/game/provinces.js';
import { finding, n0, reportFindings, section, sub } from './harness.mjs';

const SEEDS = ['world-audit-1', 'world-audit-2', 'world-audit-3'];

for (const seed of SEEDS) {
  section(`MAKRO DUNYA — ${seed} (${STANDARD_COLS}x${STANDARD_ROWS})`);
  const world = generateWorld(seed, { cols: STANDARD_COLS, rows: STANDARD_ROWS });
  generateNations(world, { seed: `${seed}-nations` });
  initProvinces(world);
  const nations = world.nations;
  const provinces = world.provinces;

  sub('1. arketipler');
  const roles = new Map();
  for (const nation of nations) {
    roles.set(nation.archetype, (roles.get(nation.archetype) ?? 0) + 1);
  }
  const required = [
    'denizci-imparatorluk', 'kuzey-imparatorlugu', 'bilesik-monarsi',
    'kavsak-imparatorlugu', 'dogu-devi', 'ada-modernlesicisi', 'yeni-federasyon',
  ];
  const missing = required.filter((role) => !roles.has(role));
  console.log('  roller: ' + [...roles].map(([r, n]) => `${r}${n > 1 ? `x${n}` : ''}`).join(' · '));
  if (missing.length) {
    finding('CRITICAL', 'arketipler', 'yedi ana arketip de dogmali', `eksik: ${missing.join(', ')}`);
  } else console.log('  Yedi ana arketip de dogdu.');

  sub('2. province bandi');
  // Bant CEKIRDEK topraga bakar (kullanicinin yogunluk tablosu); deniz asiri
  // koloni ayri sayilir ve kendi tavanini asamaz.
  const coreCount = new Map();
  const colonialCount = new Map();
  for (const p of provinces) {
    if (p.owner < 0) continue;
    if (p.coreOf === p.owner) coreCount.set(p.owner, (coreCount.get(p.owner) ?? 0) + 1);
    else colonialCount.set(p.owner, (colonialCount.get(p.owner) ?? 0) + 1);
  }
  const coreOver = nations.filter((n) => (coreCount.get(n.id) ?? 0) > 35);
  const colonyOver = nations.filter((n) => (colonialCount.get(n.id) ?? 0) > 30);
  const avg = nations.reduce((s, n) => s + (coreCount.get(n.id) ?? 0), 0)
    / Math.max(1, nations.length);
  console.log(`  ulke ${nations.length} · ort cekirdek ${avg.toFixed(1)} province/ulke`
    + ` · en buyuk cekirdek ${Math.max(...nations.map((n) => coreCount.get(n.id) ?? 0))}`
    + ` · en buyuk koloni ${Math.max(0, ...nations.map((n) => colonialCount.get(n.id) ?? 0))}`);
  if (coreOver.length) {
    finding('HIGH', 'cekirdek bandi', '<= 35 cekirdek province',
      coreOver.map((n) => `${n.archetype}:${coreCount.get(n.id)}`).join(', '));
  }
  if (colonyOver.length) {
    finding('HIGH', 'koloni bandi', '<= 30 koloni province',
      colonyOver.map((n) => `${n.archetype}:${colonialCount.get(n.id)}`).join(', '));
  }
  if (avg > 22) finding('MEDIUM', 'ortalama yogunluk', 'ort <= 22 cekirdek/ulke', avg.toFixed(1));
  if (!coreOver.length && !colonyOver.length && avg <= 22) {
    console.log('  Bant tutuyor: ulkeler okunur boyutta.');
  }

  sub('3. dolu dunya (sahipsiz toprak kalmamali)');
  // Tasarim degisti: dunya artik BOS birakilmaz. Kolonizasyon gerilimi
  // bosluktan degil, sinir devletlerinin ZAYIFLIGINDAN gelir (bkz. 7).
  const owned = provinces.filter((p) => p.owner >= 0).length;
  const freeShare = 1 - owned / provinces.length;
  console.log(`  sahipli ${owned}/${provinces.length} · sahipsiz %${(freeShare * 100).toFixed(1)}`);
  if (freeShare > 0.001) {
    finding('HIGH', 'sahipsiz toprak', 'her province bir devlete bagli olmali',
      `%${(freeShare * 100).toFixed(1)} sahipsiz (${provinces.length - owned} province)`);
  } else console.log('  Dunyada sahipsiz province yok.');

  sub('4. yarimada kolonisi');
  const maritime = nations.find((n) => n.archetype === 'denizci-imparatorluk');
  if (!maritime) {
    finding('CRITICAL', 'koloni', 'denizci imparatorluk yok', '-');
  } else {
    const colonial = provinces.filter(
      (p) => p.owner === maritime.id && p.coreOf !== maritime.id && p.zone === 'guney-yarimada',
    );
    const homePop = provinces.filter((p) => p.coreOf === maritime.id)
      .reduce((s, p) => s + (p.econ?.population ?? 0), 0);
    const colonyPop = colonial.reduce((s, p) => s + (p.econ?.population ?? 0), 0);
    const foreignCulture = colonial.every(
      (p) => !maritime.accepted.includes(p.culture),
    );
    console.log(`  koloni ${colonial.length} province · nufus ${n0(colonyPop)}`
      + ` (ev: ${n0(homePop)}) · kultur kabul edilmemis: ${foreignCulture}`);
    if (colonial.length < 8) {
      finding('HIGH', 'koloni boyu', '>= 8 province', String(colonial.length));
    }
    if (colonyPop < homePop * 0.6) {
      finding('MEDIUM', 'koloni nufusu', 'ev nufusunun >= %60 kadari (Hindistan dinamigi)',
        `%${Math.round((colonyPop / Math.max(1, homePop)) * 100)}`);
    }
    if (!foreignCulture) {
      finding('HIGH', 'koloni kulturu', 'kabul edilmemis kultur olmali', 'kabul edilmis cikti');
    }
  }

  sub('5. ic deniz (halka testi)');
  // Ic deniz bogazla okyanusa BAGLI olabilir (istenen bu!); kapali bilesen
  // aramak yaniltici. Olcum: ic-deniz capasinin cevresinde su havzasi var mi
  // ve etrafindaki halka agirlikla karayla cevrili mi?
  const anchor = world.macroAnchors?.['ic-deniz'];
  if (!anchor) {
    finding('MEDIUM', 'ic deniz', 'sablonda ic-deniz capasi', 'yok');
  } else {
    const cx = Math.floor(anchor.u * world.cols);
    const cy = Math.floor(anchor.v * world.rows);
    const at = (dc, dr) => world.tileAt(cx + dc, cy + dr);
    let basinWater = 0;
    let basinTotal = 0;
    let ringLand = 0;
    let ringTotal = 0;
    for (let dr = -13; dr <= 13; dr++) {
      for (let dc = -13; dc <= 13; dc++) {
        const d = Math.max(Math.abs(dc), Math.abs(dr));
        const tile = at(dc, dr);
        if (!tile) continue;
        if (d <= 4) {
          basinTotal++;
          if (tile.terrain.water) basinWater++;
        } else if (d >= 10) {
          ringTotal++;
          if (!tile.terrain.water) ringLand++;
        }
      }
    }
    const basinShare = basinTotal ? basinWater / basinTotal : 0;
    const ringShare = ringTotal ? ringLand / ringTotal : 0;
    console.log(`  havza su %${Math.round(basinShare * 100)}`
      + ` · cevre halka kara %${Math.round(ringShare * 100)}`);
    if (basinShare < 0.5 || ringShare < 0.55) {
      finding('MEDIUM', 'ic deniz', 'havza >= %50 su, halka >= %55 kara',
        `havza %${Math.round(basinShare * 100)}, halka %${Math.round(ringShare * 100)}`);
    } else console.log('  Ic deniz okunur: karayla cevrili havza.');
  }

  sub('6. bolgesel doku');
  const westStates = nations.filter((n) => {
    const home = provinces.find((p) => p.coreOf === n.id);
    return home?.zone === 'yogun-bati';
  }).length;
  if (westStates < 5) {
    finding('HIGH', 'yogun-bati dokusu', '>= 5 devlet (Avrupa hissi)', String(westStates));
  } else console.log(`  yogun-batida ${westStates} devlet.`);

  sub('7. kolonizasyon alani (zayif sinir devletleri)');
  // Yeni olcut: ic bolge BOS degil, ama buyuk gucun degil GELISMEMIS yerel
  // devletlerin elinde olmali. Av alani olmasi bundan gelir.
  const FRONTIER = new Set([
    'kabile-birligi', 'sinir-konfederasyonu', 'bozkir-boyu', 'ada-beyligi',
    'kiyi-kralligi', 'kistak-beyligi',
  ]);
  const interior = provinces.filter((p) => p.zone === 'guney-kita' && !p.coastal);
  const frontierHeld = interior.filter(
    (p) => p.owner >= 0 && FRONTIER.has(nations[p.owner].archetype),
  ).length;
  const share = interior.length ? frontierHeld / interior.length : 1;
  const devs = new Set(interior.filter((p) => p.owner >= 0).map((p) => nations[p.owner].devTier));
  console.log(`  guney-kita ici: ${frontierHeld}/${interior.length} yerel sinir devletinde`
    + ` (%${(share * 100).toFixed(0)}) · gelisim kademeleri: ${[...devs].sort().join(',') || '-'}`);
  if (share < 0.7) {
    finding('HIGH', 'kolonizasyon alani', 'ic bolgenin >= %70 kadari gelismemis yerel devlette',
      `%${(share * 100).toFixed(0)}`);
  }
  if ([...devs].some((d) => d > 0)) {
    finding('MEDIUM', 'kolonizasyon alani', 'ic bolge devletleri dev 0 olmali', `kademe ${[...devs].join(',')}`);
  }

  sub('8. nufus asimetrisi');
  const zonePop = new Map();
  for (const p of provinces) {
    if (!p.econ) continue;
    zonePop.set(p.zone, (zonePop.get(p.zone) ?? 0) + p.econ.population);
  }
  const east = zonePop.get('dogu-ovasi') ?? 0;
  const west = zonePop.get('yogun-bati') ?? 0;
  console.log('  bolge nufuslari: ' + [...zonePop].sort((a, b) => b[1] - a[1]).slice(0, 6)
    .map(([z, p]) => `${z} ${n0(p)}`).join(' · '));
  if (east < west * 1.5) {
    finding('MEDIUM', 'dogu devi nufusu', 'dogu ovasi >= yogun-bati x1.5', `${n0(east)} vs ${n0(west)}`);
  } else console.log('  Dogu ovasi nufus devi olarak okunuyor.');
}

process.exit(reportFindings() > 0 ? 1 : 0);
