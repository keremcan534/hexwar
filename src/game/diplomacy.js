// Diplomasi: ülkeler arası savaş/barış durumu.
// Herkesin doğuştan savaşta olması haritayı erken mop-up'a çeviriyordu;
// barış varsayılan, savaş bir karar.

export const WAR = 'war';
export const PEACE = 'peace';

/** Barış görüşmesi için savaşın en az sürmesi gereken tur sayısı. */
export const MIN_WAR_TURNS = 8;

/**
 * Simetrik ilişki tablosu: world.relations[a][b] ile [b][a] *aynı* nesnedir.
 * Kopyalarsak bir yönü güncelleyip diğerini unutmak mümkün olur.
 */
export function initRelations(world) {
  const n = world.nations.length;
  world.relations = Array.from({ length: n }, () => new Array(n).fill(null));
  for (let a = 0; a < n; a++) {
    for (let b = a + 1; b < n; b++) {
      const rec = { state: PEACE, since: 1 };
      world.relations[a][b] = rec;
      world.relations[b][a] = rec;
    }
  }
}

export function relation(world, a, b) {
  if (a === b) return null;
  return world.relations?.[a]?.[b] ?? null;
}

export function atWar(world, a, b) {
  return relation(world, a, b)?.state === WAR;
}

export function atPeace(world, a, b) {
  return a !== b && !atWar(world, a, b);
}

function setState(world, a, b, state, turn) {
  const rec = { state, since: turn };
  world.relations[a][b] = rec;
  world.relations[b][a] = rec;
}

export function declareWar(game, a, b) {
  const world = game.world;
  if (a === b || atWar(world, a, b)) return false;
  setState(world, a, b, WAR, game.turns.turn);
  game.renderer.invalidateCache();
  if (a === game.turns.playerNation || b === game.turns.playerNation) {
    const other = world.nations[a === game.turns.playerNation ? b : a];
    game.turns.addLog(a === game.turns.playerNation
      ? `${other.name} ülkesine savaş ilan edildi.`
      : `${other.name} bize savaş ilan etti!`);
  }
  return true;
}

export function makePeace(game, a, b) {
  const world = game.world;
  if (!atWar(world, a, b)) return false;
  setState(world, a, b, PEACE, game.turns.turn);
  game.renderer.invalidateCache();
  if (a === game.turns.playerNation || b === game.turns.playerNation) {
    const other = world.nations[a === game.turns.playerNation ? b : a];
    game.turns.addLog(`${other.name} ile barış yapıldı.`);
  }
  return true;
}

/**
 * Karşı tarafın barış teklifini değerlendirmesi. Teklif eden güçlüyse ya da
 * hedefin başka cephesi varsa kabul edilir.
 * @returns {boolean} kabul edildi mi
 */
export function considerPeaceOffer(game, fromId, toId, rng) {
  const world = game.world;
  const rec = relation(world, fromId, toId);
  if (!rec || rec.state !== WAR) return false;
  if (game.turns.turn - rec.since < MIN_WAR_TURNS) return false;

  const mine = nationStrength(world, world.nations[fromId]);
  const theirs = nationStrength(world, world.nations[toId]);
  const theirFronts = world.nations.filter((n) => n.alive && atWar(world, n.id, toId)).length;

  const accept = mine > theirs * 0.9 || theirFronts > 1 || rng() < 0.25;
  if (accept) makePeace(game, fromId, toId);
  return accept;
}

/** Kaba askerî güç: ordu + şehir gücü. Savaş/barış kararlarının ölçütü. */
export function nationStrength(world, nation) {
  let power = 0;
  for (const unit of world.units) {
    if (unit.nationId === nation.id) power += unit.type.attack * (unit.hp / unit.type.hp);
  }
  for (const city of world.cities) {
    if (city.nationId === nation.id) power += 3;
  }
  return power;
}

/**
 * Ülkelerin kaç kareden temas ettiği. Savaş ilanı ancak komşuya yapılır,
 * yoksa YZ haritanın öbür ucundaki ülkeye savaş açıyor.
 */
export function computeContacts(world) {
  const n = world.nations.length;
  const contacts = Array.from({ length: n }, () => new Int32Array(n));
  world.forEach((tile) => {
    if (tile.owner < 0) return;
    for (const nb of world.neighbors(tile)) {
      if (nb.owner >= 0 && nb.owner !== tile.owner) contacts[tile.owner][nb.owner]++;
    }
  });
  return contacts;
}
