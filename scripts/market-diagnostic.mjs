// Dunya piyasasinin dengeye gelip gelmedigini olcer.
//
// Fiyat her hafta arz/talep dengesizligiyle carpilir ve base*0.12 - base*8
// bandina kirpilir. Bir mal bandin ucunda takiliyorsa sebep bandin darligi
// degil, zincirde yapisal bir aciktir: ya hic uretilmiyor ya hic tuketilmiyor.
// Burada hangi mallarin takildigi ve *neden* takildigi listelenir.

import { Game } from '../src/game/game.js';
import { TurnManager } from '../src/game/turn.js';
import { generateWorld } from '../src/world/worldgen.js';
import { generateNations } from '../src/world/nations.js';
import { FACTORIES, GOODS } from '../src/game/economy.js';
import { provinceRgoJobs, rgoLaborScale } from '../src/game/provinces.js';

function headless(seed) {
  const game = Object.create(Game.prototype);
  game.world = generateWorld(seed);
  generateNations(game.world, { seed: `${seed}-nations` });
  Object.assign(game, {
    selected: null, selectedUnit: null, selected_: [], activeGeneral: null,
    reachable: null, autosaveEnabled: false, listeners: {},
    renderer: { invalidateCache() {}, resize() {} },
    camera: { setBounds() {}, fit() {} },
    emit() {}, requestRender() {}, autosave() {}, setSpeed() {},
  });
  game.turns = new TurnManager(game);
  game.turns.start(game.world);
  game.turns.playerNation = -1;
  return game;
}

const FLOOR = 0.12;
const CEIL = 8;
const EPS = 0.02;   // bandin ucune bu kadar yakinsa "takili" sayilir

function bandState(state, base) {
  const ratio = state.price / base;
  if (ratio <= FLOOR * (1 + EPS)) return 'taban';
  if (ratio >= CEIL * (1 - EPS)) return 'tavan';
  return 'serbest';
}

/** Bir malin dunyadaki uretici tesisleri ve tuketici tesisleri. */
function chainOf(goodId) {
  const producers = [];
  const consumers = [];
  for (const type of Object.values(FACTORIES)) {
    if (type.outputs?.[goodId]) producers.push(type.id);
    if (type.inputs?.[goodId]) consumers.push(type.id);
  }
  return { producers, consumers };
}

const YEARS = Number(process.argv[2] ?? 40);
const WEEKS = YEARS * 52;
const game = headless('market');
const world = game.world;

console.log(`HexWar piyasa tanilamasi — ${YEARS} yil (${WEEKS} hafta)\n`);

const marks = new Set([1, 5, 10, 20, 40, 60, 80, 100].map((y) => y * 52));
console.log('yil | serbest | tavanda | tabanda |  hammadde arz/talep |  ara mal arz/talep | GSYH');
console.log('-'.repeat(96));

/** RGO tarafi: nufus, kadro ve isgucu olcegi gercekten buyuyor mu? */
function rgoSummary() {
  let population = 0; let jobs = 0; let scale = 0; let count = 0; let control = 0;
  world.forEach((tile) => {
    const province = tile.province;
    if (!province || tile.owner < 0) return;
    const tileJobs = provinceRgoJobs(tile);
    population += province.population;
    jobs += tileJobs;
    scale += rgoLaborScale(province, tileJobs);
    control += province.control ?? 0;
    count++;
  });
  return `nufus ${Math.round(population / 1000)}k · kadro ${Math.round(jobs / 1000)}k`
    + ` · olcek ${(scale / Math.max(1, count)).toFixed(2)}`
    + ` · kontrol ${(control / Math.max(1, count)).toFixed(0)}`;
}

/** Bir kategorinin dunya capinda toplam arz ve talebi. */
function categoryFlow(category) {
  let supply = 0; let demand = 0;
  for (const [id, state] of Object.entries(world.market.goods)) {
    if (GOODS[id].category !== category) continue;
    supply += state.supply ?? 0;
    demand += state.demand ?? 0;
  }
  return { supply, demand };
}

for (let week = 1; week <= WEEKS; week++) {
  game.turns.endTurn();
  if (marks.has(week)) {
    let free = 0; let ceil = 0; let floor = 0;
    for (const [id, state] of Object.entries(world.market.goods)) {
      const s = bandState(state, GOODS[id].basePrice);
      if (s === 'tavan') ceil++;
      else if (s === 'taban') floor++;
      else free++;
    }
    const raw = categoryFlow('raw');
    const mid = categoryFlow('industrial');
    const ratio = (f) => (f.demand > 0 ? (f.supply / f.demand).toFixed(2) : '—');
    console.log(`${String(week / 52).padStart(3)} | ${String(free).padStart(7)}`
      + ` | ${String(ceil).padStart(7)} | ${String(floor).padStart(7)}`
      + ` | ${String(Math.round(raw.supply)).padStart(6)}/${String(Math.round(raw.demand)).padEnd(6)}`
      + ` ${String(ratio(raw)).padStart(4)}`
      + ` | ${String(Math.round(mid.supply)).padStart(5)}/${String(Math.round(mid.demand)).padEnd(5)}`
      + ` ${String(ratio(mid)).padStart(4)}`
      + ` | ${Math.round(world.market.totalGdp ?? 0)}`
      + ` | RGO ${rgoSummary()}`);
  }
}

// RGO province'lerinde nufus/kadro oraninin dagilimi. Ortalama olcek ile
// toplam oran birbirini tutmuyorsa dagilim carpiktir; hangisi oldugu onemli.
{
  const buckets = [0.25, 0.5, 0.75, 1, 1.5, 2, 3, Infinity];
  const hist = new Array(buckets.length).fill(0);
  let totalPop = 0; let totalJobs = 0;
  world.forEach((tile) => {
    const province = tile.province;
    if (!province || tile.owner < 0) return;
    const jobs = provinceRgoJobs(tile);
    if (jobs <= 0) return;
    const ratio = province.population / jobs;
    totalPop += province.population;
    totalJobs += jobs;
    hist[buckets.findIndex((edge) => ratio <= edge)]++;
  });
  console.log(`\nRGO nufus/kadro dagilimi (toplam oran ${(totalPop / totalJobs).toFixed(2)}):`);
  let previous = 0;
  buckets.forEach((edge, i) => {
    const label = edge === Infinity ? `>${previous}` : `${previous}-${edge}`;
    console.log(`  ${label.padEnd(10)} ${String(hist[i]).padStart(5)} province`);
    previous = edge;
  });
}

console.log(`\nBanda yapisan mallar (${YEARS}. yil):`);
console.log('mal'.padEnd(18) + 'durum'.padEnd(9) + 'fiyat/base'.padStart(11)
  + 'arz'.padStart(10) + 'talep'.padStart(10) + '  uretici -> tuketici');
console.log('-'.repeat(110));

const stuck = [];
for (const [id, state] of Object.entries(world.market.goods)) {
  const base = GOODS[id].basePrice;
  const status = bandState(state, base);
  if (status === 'serbest') continue;
  const { producers, consumers } = chainOf(id);
  stuck.push({ id, status, ratio: state.price / base, state, producers, consumers });
}
stuck.sort((a, b) => b.ratio - a.ratio);
for (const row of stuck) {
  console.log(
    row.id.padEnd(18) + row.status.padEnd(9)
    + row.ratio.toFixed(2).padStart(11)
    + (row.state.supply ?? 0).toFixed(1).padStart(10)
    + (row.state.demand ?? 0).toFixed(1).padStart(10)
    + `  ${row.producers.length ? row.producers.join(',') : 'RGO/yok'}`
    + ` -> ${row.consumers.length ? row.consumers.join(',') : 'yalniz nufus'}`,
  );
}
if (!stuck.length) console.log('  (yok — butun mallar bant icinde)');

// Tesis turlerinin guncel fiyatlarla beklenen marji: negatifse o tesis
// hicbir zaman isci alamaz ve zincirin o halkasi hic uretmez.
console.log('\nTesis turu beklenen marji (guncel fiyatlarla):');
const price = (id) => world.market.goods[id]?.price ?? GOODS[id]?.basePrice ?? 0;
const rows = Object.values(FACTORIES).map((type) => {
  const revenue = Object.entries(type.outputs ?? {})
    .reduce((sum, [id, amount]) => sum + price(id) * amount, 0);
  const cost = Object.entries(type.inputs ?? {})
    .reduce((sum, [id, amount]) => sum + price(id) * amount, 0);
  const margin = revenue > 0 ? (revenue - cost - 1.2) / revenue : 0;
  return { id: type.id, revenue, cost, margin };
}).sort((a, b) => a.margin - b.margin);
for (const row of rows) {
  const flag = row.margin <= 0 ? '  <-- isci alamaz' : '';
  console.log(`  ${row.id.padEnd(26)} gelir ${row.revenue.toFixed(1).padStart(7)}`
    + ` · girdi ${row.cost.toFixed(1).padStart(7)}`
    + ` · marj ${(row.margin * 100).toFixed(1).padStart(7)}%${flag}`);
}
