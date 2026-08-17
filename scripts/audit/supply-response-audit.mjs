// Arz tepkisi denetimi (Phase 7).
//
// Beta bulgusu: komur 70 yil boyunca fiyat tavaninda kaldi ve dunya oyunun
// SONUNDA basindan daha cok kitliga sahipti (16 -> 26). Kalici ve karli bir
// kitliga arzin tepki vermemesi dinamik sistem hatasidir.
//
// Hipotez: kisir dongu. Girdi kitligi -> orta katman tesisin marji <= 0 ->
// `investmentOptions` onu ELIYOR (margin > 0 suzgeci) -> tesis hic kurulmaz ->
// kitlik surer.

import {
  headless, alive, GOOD_IDS, GOODS, n1, n2, pct, section, sub, table,
  finding, reportFindings,
} from './harness.mjs';
import { FACTORIES, factoryMargin } from '../../src/game/economy.js';

const WEEKS = Number(process.argv[2] ?? 520);

section('ARZ TEPKISI DENETIMI (Phase 7)');

const game = headless('SUPPLY');
const world = game.world;

// Hangi mal kac hafta tavanda kaldi + o mali ureten tesis hic kuruldu mu.
const ceilingWeeks = Object.fromEntries(GOOD_IDS.map((id) => [id, 0]));
const producedBy = {};
for (const [typeId, type] of Object.entries(FACTORIES)) {
  for (const goodId of Object.keys(type.outputs ?? {})) {
    (producedBy[goodId] ??= []).push(typeId);
  }
}
// Tesis tipi basina: dunyada kac tane var, marji kac hafta pozitifti.
const builtCount = Object.fromEntries(Object.keys(FACTORIES).map((t) => [t, 0]));
const marginPositiveWeeks = Object.fromEntries(Object.keys(FACTORIES).map((t) => [t, 0]));

for (let w = 0; w < WEEKS; w++) {
  game.turns.endTurn();
  for (const id of GOOD_IDS) {
    const g = world.market.goods[id];
    if (g.price >= GOODS[id].basePrice * 8 - 1e-6) ceilingWeeks[id]++;
  }
  for (const typeId of Object.keys(FACTORIES)) {
    if (factoryMargin(world, typeId) > 0) marginPositiveWeeks[typeId]++;
  }
}
for (const nation of alive(game)) {
  for (const f of nation.economy.factories ?? []) {
    builtCount[f.typeId] = (builtCount[f.typeId] ?? 0) + 1;
  }
}

// --- 1. Kalici tavan mallari ---
sub('KALICI TAVAN MALLARI');
const stuck = GOOD_IDS
  .map((id) => {
    const g = world.market.goods[id];
    const makers = producedBy[id] ?? [];
    return {
      id, name: GOODS[id].name,
      weeks: ceilingWeeks[id],
      share: ceilingWeeks[id] / WEEKS,
      price: g.price, base: GOODS[id].basePrice,
      supply: g.supply, demand: g.demand,
      makers,
      built: makers.reduce((s, t) => s + (builtCount[t] ?? 0), 0),
      marginOk: makers.length
        ? Math.max(...makers.map((t) => marginPositiveWeeks[t] / WEEKS)) : null,
    };
  })
  .filter((r) => r.share > 0.5)
  .sort((a, b) => b.share - a.share);

console.log(table(stuck.slice(0, 14), [
  { label: 'mal', get: (r) => r.name, right: false },
  { label: 'tavanda', get: (r) => pct(r.share) },
  { label: 'fiyat/taban', get: (r) => `${n1(r.price / r.base)}x` },
  { label: 'arz', get: (r) => n1(r.supply) },
  { label: 'talep', get: (r) => n1(r.demand) },
  { label: 'tesis', get: (r) => (r.makers.length ? r.makers.length : 'RGO') },
  { label: 'kurulu', get: (r) => (r.makers.length ? r.built : '-') },
  { label: 'marj>0', get: (r) => (r.marginOk === null ? '-' : pct(r.marginOk)) },
]));

// --- 2. Kisir dongu: karli olmadigi icin hic kurulmayan tesis ---
sub('YATIRIM SUZGECININ ELEDIKLERI');
const rows = Object.keys(FACTORIES).map((typeId) => ({
  typeId,
  name: FACTORIES[typeId].name,
  built: builtCount[typeId] ?? 0,
  marginShare: marginPositiveWeeks[typeId] / WEEKS,
  margin: factoryMargin(world, typeId),
  outputs: Object.keys(FACTORIES[typeId].outputs ?? {}),
})).sort((a, b) => a.marginShare - b.marginShare);

console.log(table(rows.slice(0, 14), [
  { label: 'tesis', get: (r) => r.name, right: false },
  { label: 'kurulu', get: (r) => r.built },
  { label: 'marj>0 hafta', get: (r) => pct(r.marginShare) },
  { label: 'son marj', get: (r) => n2(r.margin) },
  { label: 'urun', get: (r) => r.outputs.join(','), right: false },
]));

// ASIL BULGU: hic kurulmamis VE marji hic pozitif olmamis tesisler
const neverViable = rows.filter((r) => r.built === 0 && r.marginShare < 0.02);
console.log(`\n  Hic kurulmayan ve marji neredeyse hic pozitif olmayan tesis: `
  + `${neverViable.length}/${rows.length}`);
for (const r of neverViable) {
  const starved = r.outputs.filter((o) => (ceilingWeeks[o] ?? 0) / WEEKS > 0.5);
  console.log(`    ${r.name}: marj ${n2(r.margin)} · urunu ${r.outputs.join(',')}`
    + (starved.length ? ` · BU URUN TAVANDA (${starved.join(',')})` : ''));
}

const viciousCycle = neverViable.filter(
  (r) => r.outputs.some((o) => (ceilingWeeks[o] ?? 0) / WEEKS > 0.5),
);
if (viciousCycle.length) {
  finding('HIGH', 'kisir dongu: kitlik yatirimi engelliyor',
    'kalici ve karli bir kitlik yeni uretim kapasitesi cekmeli',
    `${viciousCycle.length} tesis tipi hic kurulmuyor ve urunu kalici tavanda`,
    'investmentOptions `margin > 0` suzgeci: girdi pahali oldugu icin marj negatif, '
    + 'marj negatif oldugu icin tesis kurulmuyor, kurulmadigi icin kitlik suruyor');
}

// --- 3. Talebi olup arzi hic olmayan mallar ---
sub('TALEBI VAR ARZI YOK');
const dead = GOOD_IDS.map((id) => ({
  id, name: GOODS[id].name,
  supply: world.market.goods[id].supply,
  demand: world.market.goods[id].demand,
  makers: (producedBy[id] ?? []).length,
  built: (producedBy[id] ?? []).reduce((s, t) => s + (builtCount[t] ?? 0), 0),
})).filter((r) => r.demand > 0.5 && r.supply < 1e-6);
if (dead.length) {
  console.log(table(dead, [
    { label: 'mal', get: (r) => r.name, right: false },
    { label: 'talep', get: (r) => n1(r.demand) },
    { label: 'ureten tesis tipi', get: (r) => r.makers },
    { label: 'kurulu', get: (r) => r.built },
  ]));
} else console.log('  (yok)');

process.exit(reportFindings() > 0 ? 1 : 0);
