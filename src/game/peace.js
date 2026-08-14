// Barış görüşmesi. EU4'teki gibi: savaş bir yerde biter, ama *neyin* el
// değiştireceği pazarlıkla belirlenir.
//
// Eskiden `makePeace` işgal altındaki her kareyi otomatik devrediyordu; oyuncu
// ne isteyeceğini seçemiyor, karşı taraf da hiçbir şey teklif edemiyordu.
// Burada iki şey var: savaşın kim tarafından kazanıldığını ölçen **warscore**
// ve o puanın satın alabileceği kadar toprak isteyen bir **teklif**.
//
// Katman notu: saf hesap. DOM'a dokunmaz, çizim bilmez.

import { atWar, makePeace, nationStrength } from './diplomacy.js';
import { controllerOf } from './control.js';

/** Warscore 0-100 arasıdır; 100 tam teslimiyet demektir. */
export const MAX_WAR_SCORE = 100;

/**
 * Bir barışta alınabilecek azami province sayısı. Victoria'da savaşlar ülke
 * yutmaz, sınır düzeltir: tam zafer bile birkaç eyalet getirir. Sınır olmadan
 * warscore 100'e ulaşan taraf düşmanın yarısını tek anlaşmada alıyordu.
 */
export const MAX_DEMAND_TILES = 6;

/** Toprak dışı talepler. Hepsinin gerçek bir oyun etkisi vardır. */
export const PEACE_TERMS = {
  REPARATIONS: {
    id: 'REPARATIONS', name: 'War Reparations', icon: '¤', cost: 18, turns: 260,
    desc: 'They pay you a share of their treasury income for five years.',
  },
  DEMILITARIZE: {
    id: 'DEMILITARIZE', name: 'Demilitarisation', icon: '⚔', cost: 24, turns: 208,
    desc: 'They cannot raise new divisions for four years.',
  },
  CONCESSION: {
    id: 'CONCESSION', name: 'Resource Concession', icon: '⛏', cost: 20, turns: 312,
    desc: 'A fifth of their raw production is shipped to you for six years.',
  },
  FACTORY_RIGHTS: {
    id: 'FACTORY_RIGHTS', name: 'Industrial Rights', icon: '🏭', cost: 14, turns: 312,
    desc: 'Your capital may open factories in their states for six years.',
  },
  LIBERATE: {
    id: 'LIBERATE', name: 'Liberate Minorities', icon: '⚑', cost: 35,
    desc: 'Provinces of a culture foreign to them break away and become independent.',
  },
  VASSALIZE: {
    id: 'VASSALIZE', name: 'Vassalise', icon: '👑', cost: 65,
    desc: 'They become your vassal: permanent peace and a tribute of their income.',
  },
};

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

/**
 * Bir province'in barış masasındaki bedeli. Kalabalık ve şehirli toprak
 * pahalıdır; kimsenin yaşamadığı kenar province ucuz. Böylece "warscore'um 40,
 * ne alabilirim" sorusunun cevabı haritaya bakarak verilir.
 */
export function tileWarCost(tile) {
  if (!tile || tile.owner < 0 || !tile.terrain.passable) return 0;
  // tile.province paylaşılan KÜME econ'udur: nüfus hex payına indirgenir,
  // yoksa warScore toplamı aynı havuzu üye sayısı kadar sayardı.
  const hexes = tile.province?.hexes ?? 1;
  const population = (tile.province?.population ?? 0) / hexes;
  const development = (tile.province?.agriculture ?? 0)
    + (tile.province?.extraction ?? 0) + (tile.province?.commerce ?? 0);
  return Math.max(1, Math.round(
    2 + population / 3000 + development * 0.6 + (tile.city ? 12 : 0),
  ));
}

/**
 * Savaşın gidişatı. Üç kaynaktan beslenir: işgal ettiğin toprak, işgal edilen
 * toprağın ve kaba askerî üstünlük. Pozitif değer `a` önde demektir.
 */
export function warScore(world, a, b) {
  if (!atWar(world, a, b)) return 0;
  let held = 0;
  let lost = 0;
  let theirTotal = 0;
  let ourTotal = 0;
  for (const tile of world.tiles) {
    if (tile.owner === b) {
      theirTotal += tileWarCost(tile);
      if (controllerOf(tile) === a) held += tileWarCost(tile);
    } else if (tile.owner === a) {
      ourTotal += tileWarCost(tile);
      if (controllerOf(tile) === b) lost += tileWarCost(tile);
    }
  }
  // İşgal payı asıl belirleyicidir: toprak tutmadan savaş kazanılmış sayılmaz.
  const occupation = (held / Math.max(1, theirTotal)) - (lost / Math.max(1, ourTotal));
  const mine = nationStrength(world, world.nations[a]);
  const theirs = nationStrength(world, world.nations[b]);
  const edge = (mine - theirs) / Math.max(1, mine + theirs);
  return clamp(Math.round((occupation * 0.75 + edge * 0.25) * MAX_WAR_SCORE),
    -MAX_WAR_SCORE, MAX_WAR_SCORE);
}

/** Teklifin toplam bedeli: istenen toprak + talepler eksi verilen toprak. */
export function offerCost(world, offer) {
  const tiles = (list) => (list ?? []).reduce((sum, key) => {
    const [q, r] = key.split(':').map(Number);
    return sum + tileWarCost(world.get(q, r));
  }, 0);
  const terms = (offer?.terms ?? []).reduce(
    (sum, id) => sum + (PEACE_TERMS[id]?.cost ?? 0), 0,
  );
  return tiles(offer?.demands) + terms - tiles(offer?.concessions);
}

/** Vassallik yalnız açık ara zayıf düşmandan istenebilir. */
export function canVassalize(world, a, b) {
  const mine = nationStrength(world, world.nations[a]);
  const theirs = nationStrength(world, world.nations[b]);
  return mine > theirs * 2.5 && world.nations[b].tiles > 0;
}

export function termAvailable(world, a, b, termId) {
  if (termId === 'VASSALIZE') return canVassalize(world, a, b);
  if (termId === 'LIBERATE') {
    const target = world.nations[b];
    return world.tiles.some(
      (tile) => tile.owner === b && tile.terrain.passable && tile.culture !== target.culture,
    );
  }
  return true;
}

export function tileKey(tile) {
  return `${tile.q}:${tile.r}`;
}

/**
 * Bir kare barış masasında istenebilir mi? Yalnız karşı tarafın *egemenliğinde*
 * olan geçilebilir kareler; kendi toprağını "istemek" anlamsızdır.
 */
export function canDemandTile(tile, targetId) {
  return Boolean(tile?.terrain.passable && tile.owner === targetId);
}

export function canConcedeTile(tile, ownId) {
  return Boolean(tile?.terrain.passable && tile.owner === ownId);
}

/**
 * Karşı taraf bu teklifi kabul eder mi? Kural basit ve okunur: istediğin
 * toprağın bedeli, elindeki warscore'u aşamaz. Verdiğin toprak bedeli düşürür,
 * yani kaybeden taraf da masaya bir şey koyarak anlaşma satın alabilir.
 */
/** Teklifin neden reddedildiği; kabul edilirse null. */
export function offerRefusal(world, a, b, offer) {
  const demands = offer?.demands ?? [];
  if (demands.length > MAX_DEMAND_TILES) {
    return `No treaty may transfer more than ${MAX_DEMAND_TILES} provinces.`;
  }
  for (const termId of offer?.terms ?? []) {
    if (!termAvailable(world, a, b, termId)) {
      return `${PEACE_TERMS[termId]?.name ?? 'That demand'} cannot be imposed on them.`;
    }
  }
  const cost = offerCost(world, offer);
  if (cost <= 0) return null;
  const score = Math.max(0, warScore(world, a, b));
  if (cost > score) return `They refuse: the demand exceeds your war score by ${cost - score}.`;
  return null;
}

export function offerAcceptable(world, a, b, offer) {
  return offerRefusal(world, a, b, offer) === null;
}

/**
 * Masada istenebilecek şey, cephede tutulan şeydir: `a`nın fiilen işgal ettiği
 * `b` kareleri, değerlisinden ucuzuna. Teklif kurmanın ham maddesi.
 */
export function occupiedTilesOf(world, a, b) {
  const held = [];
  for (const tile of world.tiles) {
    if (tile.owner !== b || !tile.terrain.passable) continue;
    if (controllerOf(tile) !== a) continue;
    held.push({ tile, cost: tileWarCost(tile) });
  }
  return held.sort((x, y) => y.cost - x.cost);
}

/**
 * Şartların istenme sırası. Kalıcı olanlar (vassallık, bağımsızlık) önce
 * denenir; bütçe yetmezse süreli olanlara düşülür.
 */
const TERM_PRIORITY = [
  'VASSALIZE', 'LIBERATE', 'REPARATIONS', 'CONCESSION', 'FACTORY_RIGHTS', 'DEMILITARIZE',
];

/**
 * Warscore bütçesiyle bir teklif kurar. Oyuncunun masada elle yaptığının
 * aynısı: önce tutulan toprak, kalan bütçe şartlara. Bütçe yoksa sonuç beyaz
 * barıştır — "savaşı bitirelim, kimse bir şey almasın".
 *
 * `appetite` bütçenin ne kadarının harcanacağını söyler; YZ her seferinde
 * son kuruşuna kadar dayatmasın diye vardır.
 */
export function buildOffer(world, a, b, options = {}) {
  const { appetite = 1, maxTiles = MAX_DEMAND_TILES, termShare = 0 } = options;
  const offer = { demands: [], concessions: [], terms: [] };
  const budget = Math.floor(Math.max(0, warScore(world, a, b)) * clamp(appetite, 0, 1));
  if (budget <= 0) return offer;

  // Toprak her zaman önce gelirse şartlar hiç alınmaz: en ucuz şart bile birkaç
  // province ediyor. `termShare` bütçenin bir kısmını masada tutar, böylece
  // "toprak yerine tazminat" diyen bir barış da mümkün olur.
  const reserved = Math.floor(budget * clamp(termShare, 0, 1));
  let left = budget - reserved;
  for (const { tile, cost } of occupiedTilesOf(world, a, b)) {
    if (offer.demands.length >= maxTiles) break;
    if (cost > left) continue;
    offer.demands.push(tileKey(tile));
    left -= cost;
  }
  // Toprağa harcanmayan bütçe de şartlara akar; hiçbir puan boşa gitmez.
  left += reserved;
  for (const termId of TERM_PRIORITY) {
    const term = PEACE_TERMS[termId];
    if (!term || term.cost > left) continue;
    if (!termAvailable(world, a, b, termId)) continue;
    offer.terms.push(termId);
    left -= term.cost;
  }
  return offer;
}

/**
 * Teklifin *alıcı* için net değeri. Negatif sayı "bu kadarını kaybediyorum"
 * demektir. `offerCost` teklifi verenin gözünden bakar; masanın iki tarafı
 * olduğu için karşı tarafın hesabı da gerekli.
 */
export function offerValueFor(world, offer) {
  return -offerCost(world, offer);
}

/**
 * Süreli anlaşma şartını kaydeder. Etkiler tek yerde tutulur ki hangi ülkenin
 * neye tabi olduğu tek bakışta okunsun ve süre dolunca temizlenebilsin.
 */
function addTreaty(nation, treaty) {
  nation.treaties = (nation.treaties ?? []).filter(
    (existing) => existing.type !== treaty.type || existing.partner !== treaty.partner,
  );
  nation.treaties.push(treaty);
}

export function treatiesOf(nation) {
  return nation?.treaties ?? [];
}

/** Bir ülke şu an bu şarta tabi mi? */
export function underTreaty(nation, type, turn) {
  return treatiesOf(nation).some(
    (treaty) => treaty.type === type && (treaty.until ?? Infinity) > turn,
  );
}

/** Süresi dolan şartlar temizlenir; her tur bir kez çağrılır. */
export function expireTreaties(world, turn) {
  for (const nation of world.nations) {
    if (!nation.treaties?.length) continue;
    nation.treaties = nation.treaties.filter((treaty) => (treaty.until ?? Infinity) > turn);
  }
}

/** Toprak dışı şartların uygulanması. */
function applyTerms(game, a, b, terms) {
  const world = game.world;
  const turn = game.turns.turn;
  const winner = world.nations[a];
  const loser = world.nations[b];
  for (const termId of terms ?? []) {
    const term = PEACE_TERMS[termId];
    if (!term || !termAvailable(world, a, b, termId)) continue;
    if (termId === 'LIBERATE') {
      // Yabancı kültürlü province'ler bağımsızlaşır: imparatorluk küçülür ama
      // toprak fatihe geçmez — Victoria'daki "ulus serbest bırakma" bunu yapar.
      for (const tile of world.tiles) {
        if (tile.owner !== b || !tile.terrain.passable) continue;
        if (tile.culture === loser.culture) continue;
        loser.tiles = Math.max(0, loser.tiles - 1);
        tile.owner = -1;
        tile.controller = -1;
        if (tile.province) tile.province.control = 60;
      }
      continue;
    }
    if (termId === 'VASSALIZE') {
      addTreaty(loser, { type: 'VASSALIZE', partner: a, since: turn });
      continue;
    }
    addTreaty(loser, {
      type: termId, partner: a, since: turn, until: turn + (term.turns ?? 0),
    });
  }
  game.turns.addLog?.(`${winner.name} imposed terms on ${loser.name}.`);
}

/**
 * Anlaşmayı uygular. `settleOccupations` yerine *yalnız anlaşılan* kareler el
 * değiştirir; geri kalan işgaller barışla birlikte kalkar.
 */
export function signPeace(game, a, b, offer) {
  const world = game.world;
  if (!atWar(world, a, b)) return false;
  if (!offerAcceptable(world, a, b, offer)) return false;

  const transfer = (keys, from, to) => {
    for (const key of keys ?? []) {
      const [q, r] = key.split(':').map(Number);
      const tile = world.get(q, r);
      if (!tile || tile.owner !== from) continue;
      game.turns.claimAtPeace(tile, to);
    }
  };
  transfer(offer?.demands, b, a);
  transfer(offer?.concessions, a, b);
  applyTerms(game, a, b, offer?.terms);
  // Anlaşma dışında kalan işgaller sahibine döner: barış cepheyi siler.
  for (const tile of world.tiles) {
    const controller = controllerOf(tile);
    if (controller === tile.owner) continue;
    if ((tile.owner === a && controller === b) || (tile.owner === b && controller === a)) {
      tile.controller = tile.owner;
    }
  }
  return makePeace(game, a, b, { settle: false });
}
