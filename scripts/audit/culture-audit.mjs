// Kultur dokusu denetimi.
//
// Iddia: harita tek renk bloklardan olusmuyor; ulkeler cok etnikli, sinirlar
// gradyan ve bazi halklar eski menzillerinde azinlik olarak yasiyor.
//
// Olculen sey GORUNUR dokudur, uretim ici ara degerler degil:
//   1. kultur ve dil ailesi sayisi
//   2. karisik province orani (azinlik payi >= %15)
//   3. ulke basina halk sayisi — "mega ulkenin icinde birden fazla etnik"
//   4. kirilmis kulturler: az yerde cogunluk, cok yerde azinlik
//   5. cizgi okunabilirligi: cogunluk-azinlik renk ayrimi
//   6. determinizm: ayni tohum ayni dokuyu verir
//   7. halklar dogusta (redesign D3, 2026-10-15): imparatorluklarin etkin
//      halk sayisi (ENC, nufus agirlikli), ana halk = cekirdegin en buyuk
//      halki, koloni halki kabul edilmemis. Esikler TASARIM KARARIDIR
//      (redesign §5/§6 P2), taban degil.
//
// Bu dosya URETIM KODU DEGILDIR ve src/ altina hicbir sey sizdirmaz.

import { generateWorld } from '../../src/world/worldgen.js';
import { generateNations } from '../../src/world/nations.js';
import { initProvinces } from '../../src/game/provinces.js';

const SEEDS = ['CULTURE-A', 'CULTURE-B', 'CULTURE-C'];
const MINORITY = 0.15;

function build(seed) {
  const world = generateWorld(seed, { cols: 160, rows: 96 });
  generateNations(world, { seed: `${seed}-nations` });
  // Nufus (ENC agirligi) dunya uretiminde yoktur; tur 1 nufusu buradan gelir.
  initProvinces(world);
  return world;
}

/** hsl(...) dizgesinden kaba ayirt edilebilirlik puani. */
function hsl(color) {
  const m = String(color).match(/hsl\((\d+(?:\.\d+)?) (\d+(?:\.\d+)?)% (\d+(?:\.\d+)?)%\)/);
  return m ? [+m[1], +m[2], +m[3]] : null;
}
function separation(a, b) {
  const x = hsl(a);
  const y = hsl(b);
  if (!x || !y) return 99;
  let dh = Math.abs(x[0] - y[0]);
  if (dh > 180) dh = 360 - dh;
  return dh / 3 + Math.abs(x[1] - y[1]) + Math.abs(x[2] - y[2]);
}

function measure(world) {
  const provinces = world.provinces ?? [];
  const cultures = world.cultures ?? [];
  const families = new Set(cultures.map((c) => c.family));

  const mixed = provinces.filter((p) => (p.cultures?.[1]?.share ?? 0) >= MINORITY);
  const threePlus = provinces.filter(
    (p) => (p.cultures ?? []).filter((r) => r.share >= 0.05).length >= 3,
  );

  // Paylar toplami 1 ve cogunluk gercekten en buyuk mu?
  let malformed = 0;
  for (const province of provinces) {
    const rows = province.cultures ?? [];
    if (!rows.length) {
      if (province.culture >= 0) malformed++;
      continue;
    }
    const total = rows.reduce((s, r) => s + r.share, 0);
    if (Math.abs(total - 1) > 1e-6) malformed++;
    if (rows[0].id !== province.culture) malformed++;
    for (let i = 1; i < rows.length; i++) if (rows[i].share > rows[i - 1].share + 1e-9) malformed++;
  }

  // Ulke basina halk (>= %5 pay), hex agirlikli.
  const nations = world.nations.filter((n) => n.tiles > 0);
  const perNation = nations.map((nation) => {
    const mix = new Map();
    let hexes = 0;
    for (const province of provinces) {
      if (province.owner !== nation.id) continue;
      const h = province.tileIdx.length;
      hexes += h;
      for (const row of province.cultures ?? []) {
        mix.set(row.id, (mix.get(row.id) ?? 0) + h * row.share);
      }
    }
    const list = [...mix.values()].map((v) => v / Math.max(1, hexes));
    return { hexes, peoples: list.filter((s) => s >= 0.05).length };
  });
  const big = perNation.filter((n) => n.hexes >= 60);
  const multi = perNation.filter((n) => n.peoples >= 2).length;

  // Cizgi okunabilirligi.
  let weakPairs = 0;
  for (const province of mixed) {
    const minority = province.cultures[1];
    if (separation(cultures[province.culture]?.color, cultures[minority.id]?.color) < 14) {
      weakPairs++;
    }
  }

  // D3: imparatorluklarin ENC'si (nufus agirlikli, sahip olunan butun kumeler),
  // ana halk kurali (cekirdegin hex agirlikli en buyugu) ve koloni halki.
  const ARCH = {
    'kuzey-imparatorlugu': 'kuzey', 'bilesik-monarsi': 'bilesik', 'kavsak-imparatorlugu': 'kavsak', 'dogu-devi': 'dogu',
  };
  const enc = {};
  let wrongPrim = 0;
  for (const nation of world.nations) {
    if (nation.archetype === 'rebel' || nation.tiles <= 0) continue;
    const votes = new Map();
    for (const province of provinces) {
      if (province.owner !== nation.id || province.coreOf !== nation.id) continue;
      for (const row of province.cultures ?? []) {
        votes.set(row.id, (votes.get(row.id) ?? 0) + province.tileIdx.length * row.share);
      }
    }
    const top = [...votes].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0];
    if (top !== undefined && top !== nation.culture) wrongPrim++;
    if (!ARCH[nation.archetype]) continue;
    const mix = new Map();
    let pop = 0;
    for (const province of provinces) {
      if (province.owner !== nation.id) continue;
      const w = province.econ?.population ?? 0;
      pop += w;
      for (const row of province.cultures ?? []) mix.set(row.id, (mix.get(row.id) ?? 0) + w * row.share);
    }
    const simpson = [...mix.values()].reduce((sum, v) => sum + (v / Math.max(1, pop)) ** 2, 0);
    enc[ARCH[nation.archetype]] = simpson > 0 ? 1 / simpson : 0;
  }
  const maritime = world.nations.find((n) => n.archetype === 'denizci-imparatorluk');
  const colonyAccepted = maritime ? provinces.filter((p) => p.owner === maritime.id && p.coreOf !== maritime.id
    && maritime.accepted.includes(p.culture)).length : 0;

  return {
    cultures: cultures.length,
    enc,
    wrongPrim,
    colonyAccepted,
    families: families.size,
    provinces: provinces.length,
    mixedPct: provinces.length ? mixed.length / provinces.length : 0,
    threePlus: threePlus.length,
    malformed,
    nations: perNation.length,
    multiEthnicPct: perNation.length ? multi / perNation.length : 0,
    bigAvgPeoples: big.length ? big.reduce((s, n) => s + n.peoples, 0) / big.length : 0,
    shattered: (world.cultureHistory ?? []).length,
    shatteredDetail: (world.cultureHistory ?? []).map((h) => `${h.name} ${h.kept}/${h.demoted}`),
    weakPairs,
  };
}

const runs = SEEDS.map((seed) => ({ seed, ...measure(build(seed)) }));

// Determinizm: ayni tohum iki kez.
const twin = measure(build(SEEDS[0]));
const deterministic = JSON.stringify(twin) === JSON.stringify(
  (({ seed, ...rest }) => rest)(runs[0]),
);

const avg = (key) => runs.reduce((s, r) => s + r[key], 0) / runs.length;

const ENC_FLOOR = { kuzey: [3.5, Infinity], bilesik: [5.0, Infinity], kavsak: [3.5, Infinity], dogu: [1.6, 2.8] };
const results = {
  structure: {
    // Eski dunya 22 kulturluydu ve tek renk bloklar halinde okunuyordu. D3'ten
    // beri imparatorluklarin alt halklari +18-24 kultur ekler (tasarim: 54-62).
    enoughCultures: runs.every((r) => r.cultures >= 54 && r.cultures <= 62),
    enoughFamilies: runs.every((r) => r.families >= 6),
    mixWellFormed: runs.every((r) => r.malformed === 0),
  },
  texture: {
    // Sinirlar gradyan: her dunyada kumelerin en az besde biri karisik.
    bordersBlend: runs.every((r) => r.mixedPct >= 0.15),
    // Uc halkin bir arada yasadigi yerler var.
    trueMixExists: runs.every((r) => r.threePlus >= 15),
  },
  nations: {
    // "Mega buyuk ulkenin icinde birden fazla etnik olsun."
    mostNationsMultiEthnic: runs.every((r) => r.multiEthnicPct >= 0.45),
    bigNationsDiverse: runs.every((r) => r.bigAvgPeoples >= 1.8),
  },
  history: {
    // Eskiden genis, simdi iki-uc yerde cogunluk kalan halklar.
    shatteredCultures: runs.every((r) => r.shattered >= 1),
  },
  peoples: {
    // D3 ENC tabanlari (Avusturya-Macaristan ~7.3, Rusya ~4.2, Osmanli ~3-3.5).
    empiresManyPeoplesDeep: runs.every((r) => Object.entries(ENC_FLOOR)
      .every(([k, [lo, hi]]) => r.enc[k] === undefined || (r.enc[k] >= lo && r.enc[k] <= hi))),
    // Ana halk cekirdegin en buyuk halki (eskiden baskent kumesinin cogunlugu:
    // tohum basina 11-15 yanlis ana halk).
    primaryIsLargestCorePeople: runs.every((r) => r.wrongPrim === 0),
    colonyNotAccepted: runs.every((r) => r.colonyAccepted === 0),
  },
  readability: {
    // Cizgi zemine karismamali, yoksa tarama bilgi tasimaz.
    stripesReadable: runs.every((r) => r.weakPairs === 0),
  },
  determinism: { sameSeedSameTexture: deterministic },
};
results.passed = Object.values(results)
  .every((section) => Object.values(section).every(Boolean));

console.log(JSON.stringify({
  ...results,
  detail: {
    avgCultures: +avg('cultures').toFixed(1),
    avgMixedPct: `${(avg('mixedPct') * 100).toFixed(1)}%`,
    avgMultiEthnicPct: `${(avg('multiEthnicPct') * 100).toFixed(1)}%`,
    avgBigNationPeoples: +avg('bigAvgPeoples').toFixed(2),
    runs: runs.map((r) => ({
      seed: r.seed,
      cultures: r.cultures,
      families: r.families,
      mixed: `${(r.mixedPct * 100).toFixed(0)}%`,
      threePlus: r.threePlus,
      multiEthnic: `${(r.multiEthnicPct * 100).toFixed(0)}%`,
      bigAvg: +r.bigAvgPeoples.toFixed(1),
      enc: Object.fromEntries(Object.entries(r.enc).map(([k, v]) => [k, +v.toFixed(2)])),
      wrongPrim: r.wrongPrim,
      weakPairs: r.weakPairs,
      shattered: r.shatteredDetail,
    })),
  },
}, null, 2));
if (!results.passed) process.exitCode = 1;
