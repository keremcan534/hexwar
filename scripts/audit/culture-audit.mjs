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
//
// Bu dosya URETIM KODU DEGILDIR ve src/ altina hicbir sey sizdirmaz.

import { generateWorld } from '../../src/world/worldgen.js';
import { generateNations } from '../../src/world/nations.js';

const SEEDS = ['CULTURE-A', 'CULTURE-B', 'CULTURE-C'];
const MINORITY = 0.15;

function build(seed) {
  const world = generateWorld(seed, { cols: 160, rows: 96 });
  generateNations(world, { seed: `${seed}-nations` });
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

  return {
    cultures: cultures.length,
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

const results = {
  structure: {
    // Eski dunya 22 kulturluydu ve tek renk bloklar halinde okunuyordu.
    enoughCultures: runs.every((r) => r.cultures >= 30),
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
      shattered: r.shatteredDetail,
    })),
  },
}, null, 2));
if (!results.passed) process.exitCode = 1;
