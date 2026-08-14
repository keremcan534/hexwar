// YZ savas temposunu ve sohretin gercekten devreye girip girmedigini olcer.
//
// Sohret mekanizmasi dogru calisiyor (bkz. infamy.js): surekli fetihte denge
// noktasi ~33, koalisyon esigi 30. Ama bu ancak YZ o hizda fethederse anlam
// tasir. Burada olculen sey: kac savas aciliyor, ne kadar suruyor, kac kare el
// degistiriyor ve sohret esige ulasiyor mu.

import { Game } from '../src/game/game.js';
import { TurnManager } from '../src/game/turn.js';
import { generateWorld } from '../src/world/worldgen.js';
import { generateNations } from '../src/world/nations.js';
import { INFAMY_COALITION } from '../src/game/infamy.js';

function headless(seed) {
  const game = Object.create(Game.prototype);
  game.world = generateWorld(seed);
  generateNations(game.world, { seed: `${seed}-nations` });
  Object.assign(game, {
    selected: null, selectedUnit: null, selected_: [], activeGeneral: null,
    reachable: null, autosaveEnabled: false, listeners: {},
    renderer: { invalidateCache() {}, invalidateTiles() {}, resize() {} },
    camera: { setBounds() {}, fit() {} },
    emit() {}, requestRender() {}, autosave() {}, setSpeed() {},
  });
  game.turns = new TurnManager(game);
  game.turns.start(game.world);
  game.turns.playerNation = -1;
  return game;
}

const YEARS = Number(process.argv[2] ?? 100);
const WEEKS = YEARS * 52;
const SEEDS = (process.argv[3] ?? 'war-a,war-b,war-c').split(',');

console.log(`HexWar savas temposu — ${YEARS} yil, ${SEEDS.length} tohum\n`);

const totals = {
  declared: 0, ended: 0, weeksAtWar: 0, ownerChanges: 0,
  peakInfamy: 0, coalitionReached: 0, eliminated: 0,
};

for (const seed of SEEDS) {
  const game = headless(seed);
  const world = game.world;
  const n = world.nations.length;
  const state = new Map();
  const owner = new Int32Array(world.tiles.length);
  world.tiles.forEach((tile, i) => { owner[i] = tile.owner; });

  let declared = 0; let ended = 0; let weeksAtWar = 0;
  let ownerChanges = 0; let peakInfamy = 0; let coalitionReached = 0;
  const perDecade = new Array(Math.ceil(YEARS / 10)).fill(0);

  const key = (a, b) => `${a}:${b}`;
  for (let a = 0; a < n; a++) {
    for (let b = a + 1; b < n; b++) state.set(key(a, b), world.relations[a][b].state);
  }

  for (let week = 1; week <= WEEKS; week++) {
    game.turns.endTurn();
    let warPairs = 0;
    for (let a = 0; a < n; a++) {
      for (let b = a + 1; b < n; b++) {
        const now = world.relations[a][b].state;
        const was = state.get(key(a, b));
        if (was !== 'war' && now === 'war') {
          declared++;
          perDecade[Math.min(perDecade.length - 1, Math.floor((week / 52) / 10))]++;
        }
        if (was === 'war' && now !== 'war') ended++;
        if (now === 'war') warPairs++;
        state.set(key(a, b), now);
      }
    }
    if (warPairs > 0) weeksAtWar++;
    for (const nation of world.nations) {
      const infamy = nation.infamy ?? 0;
      if (infamy > peakInfamy) peakInfamy = infamy;
      if (infamy >= INFAMY_COALITION) coalitionReached++;
    }
  }
  world.tiles.forEach((tile, i) => { if (tile.owner !== owner[i]) ownerChanges++; });
  const dead = world.nations.filter((nation) => !nation.alive).length;

  console.log(`${seed}:`);
  console.log(`  savas ilani ${declared} · biten ${ended}`
    + ` · en az bir savasin surdugu hafta ${weeksAtWar}/${WEEKS}`
    + ` (%${Math.round((weeksAtWar / WEEKS) * 100)})`);
  console.log(`  el degistiren kare ${ownerChanges} · yok olan ulke ${dead}`
    + ` · zirve sohret ${peakInfamy.toFixed(1)}/${INFAMY_COALITION}`
    + ` · esige ulasilan ulke-hafta ${coalitionReached}`);
  console.log(`  on yillik ilan dagilimi: ${perDecade.join(' ')}`);

  totals.declared += declared;
  totals.ended += ended;
  totals.weeksAtWar += weeksAtWar;
  totals.ownerChanges += ownerChanges;
  totals.peakInfamy = Math.max(totals.peakInfamy, peakInfamy);
  totals.coalitionReached += coalitionReached;
  totals.eliminated += dead;
}

const runs = SEEDS.length;
console.log('\nORTALAMA');
console.log(`  savas ilani           ${(totals.declared / runs).toFixed(1)} / ${YEARS} yil`
  + `  (${(totals.declared / runs / YEARS * 10).toFixed(1)} / on yil)`);
console.log(`  savasli hafta orani   %${Math.round((totals.weeksAtWar / runs / WEEKS) * 100)}`);
console.log(`  el degistiren kare    ${(totals.ownerChanges / runs).toFixed(0)}`);
console.log(`  yok olan ulke         ${(totals.eliminated / runs).toFixed(1)}`);
console.log(`  zirve sohret          ${totals.peakInfamy.toFixed(1)} (koalisyon esigi ${INFAMY_COALITION})`);
